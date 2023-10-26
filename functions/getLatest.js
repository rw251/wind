const FEED = {
  ESO: 'eso',
  ESO_HISTORIC: 'eso-historic',
  BMRS: 'bmrs',
  BMRS_1: 'bmrs-1',
  BMRS_2: 'bmrs-2',
  BMRS_CURRENT: 'bmrs-current',
};

let env;
let data;

async function shouldUpdate(feed) {
  const lastUpdatedString = await env.WIND.get(`LAST-UPDATED-${feed}`);
  const lastUpdated = lastUpdatedString
    ? new Date(lastUpdatedString)
    : new Date(2000, 1, 1);
  console.log(`${feed} last updated on ${lastUpdated}`);
  if (feed === FEED.eso) {
    lastUpdated.setMinutes(lastUpdated.getMinutes() + 140);
  } else if ([FEED.ESO_HISTORIC, FEED.BMRS_1, FEED.BMRS_2].indexOf(feed) > -1) {
    lastUpdated.setHours(0);
    lastUpdated.setDate(lastUpdated.getDate() + 1);
  } else {
    lastUpdated.setMinutes(lastUpdated.getMinutes() + 30);
  }
  console.log(`${feed} should next be updated on ${lastUpdated}`);
  return new Date() > lastUpdated;
}

function xml2json(xml) {
  const arr = [];
  const match = xml.match(/<responseList><item>(.+)<\/item><\/responseList>/);
  const items = match[1].split('</item><item>').forEach((item) => {
    const [, q] = item.match(/<quantity>([^<]+)<\/quantity>/);
    const [, p] = item.match(/<settlementPeriod>([^<]+)<\/settlementPeriod>/);
    const obj = { quantity: +q, period: +p };
    if (item.indexOf('Wind Offshore') > -1) {
      obj.type = 'Wind Offshore';
    } else if (item.indexOf('Wind Onshore') > -1) {
      obj.type = 'Wind Onshore';
    } else {
      return;
    }
    arr.push(obj);
  });
  return arr;
}

async function getHistoricEsoFeed() {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const dateFrom = twoDaysAgo.toISOString().substring(0, 10);
  const dateTo = oneDayAgo.toISOString().substring(0, 10);
  const url = `https://api.nationalgrideso.com/api/3/action/datastore_search_sql?sql=SELECT%20%22Datetime_GMT%22,%22Capacity%22,%22Incentive_forecast%22%20FROM%20%227524ec65-f782-4258-aaf8-5b926c17b966%22%20WHERE%20%22Datetime_GMT%22%20%3E=%20'${dateFrom}T00:00:00.000Z'%20AND%20%22Datetime_GMT%22%20%3C=%20'${dateTo}T23:59:59.999Z'%20ORDER%20BY%20%22_id%22%20ASC%20LIMIT%20100`;
  const data = await fetch(url).then((x) => x.json());
  return data.result.records;
}

async function getEsoFeed() {
  const url =
    'https://api.nationalgrideso.com/api/3/action/datastore_search?resource_id=93c3048e-1dab-4057-a2a9-417540583929&limit=670';
  const data = await fetch(url).then((resp) => resp.json());
  return data.result.records;
}

async function getBrmsFeed(daysAgo) {
  const nDaysAgo = new Date();
  nDaysAgo.setDate(nDaysAgo.getDate() - daysAgo);
  const nDaysAgoString = nDaysAgo.toISOString().substring(0, 10);
  const url = `https://api.bmreports.com/BMRS/B1630/v1?APIKey=${env.API_KEY}&SettlementDate=${nDaysAgoString}&Period=*&ServiceType=xml`;
  const xml = await fetch(url).then((resp) => resp.text());
  const json = xml2json(xml);

  return json;
}

async function getBrmsCurrentFeed() {
  const url = `https://downloads.elexonportal.co.uk/fuel/download/latest?key=${env.API_KEY}`;
  const xml = await fetch(url).then((resp) => resp.text());

  const [, wDate, wData] = xml
    .replace(/\n/g, '')
    .match(/INST AT="([^"]+)[^>]*>(.+)<\/INST/);
  const w = wData.match(/TYPE="WIND".*?VAL="([^"]+)"/)[1];

  const [, whDateRange, whData] = xml
    .replace(/\n/g, '')
    .match(/HH.*?AT="([^"]+)[^>]*>(.+)<\/HH/);
  const whDate = `${whDateRange.substring(0, 5)}:00`;
  const wh = whData.match(/TYPE="WIND".*?VAL="([^"]+)"/)[1];

  return {
    windNow: +w,
    windNowDate: wDate,
    windLastHalfHour: +wh,
    windLastHalfHourStartDate: whDate,
  };
}

async function getFeed(feed) {
  switch (feed) {
    case FEED.BMRS:
      console.log(`Getting getBrmsFeed(0)...`);
      return await getBrmsFeed(0);
    case FEED.BMRS_1:
      console.log(`Getting getBrmsFeed(1)...`);
      return await getBrmsFeed(1);
    case FEED.BMRS_2:
      console.log(`Getting getBrmsFeed(2)...`);
      return await getBrmsFeed(2);
    case FEED.ESO:
      console.log(`Getting getEsoFeed()...`);
      return await getEsoFeed();
    case FEED.ESO_HISTORIC:
      console.log(`Getting getHistoricEsoFeed()...`);
      return await getHistoricEsoFeed();
    case FEED.BMRS_CURRENT:
      console.log(`Getting getBrmsCurrentFeed()...`);
      return await getBrmsCurrentFeed();
  }
}

async function updateFeed(feed) {
  const shouldWeUpdate = await shouldUpdate(feed);
  if (shouldWeUpdate) {
    console.log(`Updating ${feed}`);
    data[feed] = await getFeed(feed);
    await env.WIND.put(`LAST-UPDATED-${feed}`, new Date().toISOString());
    return true;
  }
  return false;
}

export async function onRequest(context) {
  env = context.env;

  const dataJson = await env.WIND.get('data.json');
  data = dataJson ? JSON.parse(dataJson) : {};
  let updated = await updateFeed(FEED.BMRS);
  updated = (await updateFeed(FEED.BMRS_1)) || updated;
  updated = (await updateFeed(FEED.BMRS_2)) || updated;
  updated = (await updateFeed(FEED.BMRS_CURRENT)) || updated;
  updated = (await updateFeed(FEED.ESO)) || updated;
  updated = (await updateFeed(FEED.ESO_HISTORIC)) || updated;

  if (updated) {
    env.WIND.put('data.json', JSON.stringify(data));
  }

  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json;charset=UTF-8',
    },
  });
}
