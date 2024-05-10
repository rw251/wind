const FEED = {
  ESO: 'eso',
  ESO_HISTORIC: 'eso-historic',
  BMRS_HISTORIC: 'bmrs-historic',
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
  } else if ([FEED.ESO_HISTORIC].indexOf(feed) > -1) {
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

async function getBrmsHistoric() {
  const dateMarker = new Date();
  const dateTo = dateMarker.toISOString().substring(0, 10);
  dateMarker.setDate(dateMarker.getDate() - 2);
  const dateFrom = dateMarker.toISOString().substring(0, 10);
  const url = `https://data.elexon.co.uk/bmrs/api/v1/generation/actual/per-type/wind-and-solar?from=${dateFrom}&to=${dateTo}&settlementPeriodFrom=0&settlementPeriodTo=48&format=json`;
  const data = await fetch(url).then((resp) => resp.json());
  return data.data
    .filter((x) => x.psrType.toLowerCase().indexOf('wind') > -1)
    .map((x) => {
      return {
        quantity: x.quantity,
        period: x.settlementPeriod,
        type: x.psrType,
        startTimeISO: x.startTime,
      };
    });
}

async function getBrmsCurrentFeed() {
  const url = `https://data.elexon.co.uk/bmrs/api/v1/generation/outturn/current?fuelType=WIND&format=json`;
  const data = await fetch(url).then((x) => x.json());
  const dateMarker = new Date();
  const wDate = dateMarker.toISOString().substring(0, 19);
  dateMarker.setMinutes(dateMarker.getMinutes() - 30);
  const whDate = dateMarker.toISOString().substring(0, 19);

  return {
    windNow: data[0].currentUsage,
    windNowDate: wDate,
    windLastHalfHour: data[0].halfHourUsage,
    windLastHalfHourStartDate: whDate,
  };
}

async function getFeed(feed) {
  switch (feed) {
    case FEED.BMRS_HISTORIC:
      console.log(`Getting getBrmsHistoric()...`);
      return await getBrmsHistoric();
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
  let updated = await updateFeed(FEED.BMRS_CURRENT);
  updated = (await updateFeed(FEED.BMRS_HISTORIC)) || updated;
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
