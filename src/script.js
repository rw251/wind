let data;
let myChart;
let isUpdated = false;
let chartConfig;

async function getLatestWindData() {
  if (!data) {
    data = await fetch('/getLatest').then((x) => x.json());
  }

  const maxYAxisValue =
    data.eso && data.eso.length > 0
      ? Math.ceil(data.eso[0].Capacity / 1000) * 1000
      : 16000;

  chartConfig.options.scales.y.max = maxYAxisValue;
  chartConfig.options.scales.y1.max = maxYAxisValue;
  chartConfig.plugins.beforeDraw = genBeforeDrawFunction();

  if (!data['bmrs-historic']) data['bmrs-historic'] = [];

  const bmrsData = {};
  data['bmrs-historic'].forEach((x) => {
    const isoString = x.startTimeISO.substring(0, 19);
    if (!bmrsData[isoString]) bmrsData[isoString] = {};
    bmrsData[isoString][x.type] = x.quantity;
  });

  // Get most recent bmrs split
  const times = Object.keys(bmrsData).sort((a, b) => a < b);
  let offshoreProp = -1;
  for (let i = 0; i < times.length; i++) {
    if (
      bmrsData[times[i]]['Wind Offshore'] &&
      bmrsData[times[i]]['Wind Onshore']
    ) {
      offshoreProp =
        bmrsData[times[i]]['Wind Offshore'] /
        (bmrsData[times[i]]['Wind Offshore'] +
          bmrsData[times[i]]['Wind Onshore']);
      break;
    }
  }
  offshoreProp = offshoreProp < 0 ? 0.7 : offshoreProp;

  bmrsData[data['bmrs-current'].windLastHalfHourStartDate] = {
    'Wind Offshore': data['bmrs-current'].windLastHalfHour * offshoreProp,
    'Wind Onshore': data['bmrs-current'].windLastHalfHour * (1 - offshoreProp),
  };

  let hasAddedNow = false;

  const esoHistoric = {};
  data['eso-historic'].forEach((x) => {
    esoHistoric[x.Datetime_GMT] = x;
  });
  const esoHistoricData = Object.values(esoHistoric).sort((a, b) => {
    if (a.Datetime_GMT === b.Datetime_GMT) return 0;
    return a.Datetime_GMT > b.Datetime_GMT;
  });

  esoHistoricData.forEach((x) => {
    chartConfig.data.labels.push(new Date(x.Datetime_GMT));
    chartConfig.data.datasets[0].data.push(x.Incentive_forecast);
    chartConfig.data.datasets[1].data.push(x.Capacity);

    if (
      new Date(x.Datetime_GMT) > new Date(data['bmrs-current'].windNowDate) &&
      !hasAddedNow
    ) {
      hasAddedNow = true;
      chartConfig.data.labels.push(new Date(data['bmrs-current'].windNowDate));
      chartConfig.data.datasets[0].data.push(null);
      chartConfig.data.datasets[1].data.push(null);
      chartConfig.data.datasets[2].data.push(
        data['bmrs-current'].windNow * (1 - offshoreProp)
      );
      chartConfig.data.datasets[3].data.push(
        data['bmrs-current'].windNow * offshoreProp
      );
    }

    if (bmrsData[x.Datetime_GMT] && bmrsData[x.Datetime_GMT]['Wind Onshore']) {
      chartConfig.data.datasets[2].data.push(
        bmrsData[x.Datetime_GMT]['Wind Onshore']
      );
    } else {
      chartConfig.data.datasets[2].data.push(null);
    }
    if (bmrsData[x.Datetime_GMT] && bmrsData[x.Datetime_GMT]['Wind Offshore']) {
      chartConfig.data.datasets[3].data.push(
        bmrsData[x.Datetime_GMT]['Wind Offshore']
      );
    } else {
      chartConfig.data.datasets[3].data.push(null);
    }
  });

  data.eso.forEach((x) => {
    chartConfig.data.labels.push(new Date(x.Datetime));
    chartConfig.data.datasets[0].data.push(x.Wind_Forecast);
    chartConfig.data.datasets[1].data.push(x.Capacity);

    if (
      new Date(x.Datetime) > new Date(data['bmrs-current'].windNowDate) &&
      !hasAddedNow
    ) {
      hasAddedNow = true;
      const idx = chartConfig.data.labels.length - 1;
      chartConfig.data.labels.push(chartConfig.data.labels[idx]);
      chartConfig.data.datasets[0].data.push(
        chartConfig.data.datasets[0].data[idx]
      );
      chartConfig.data.datasets[1].data.push(
        chartConfig.data.datasets[1].data[idx]
      );
      chartConfig.data.datasets[2].data.push(
        chartConfig.data.datasets[2].data[idx]
      );
      chartConfig.data.datasets[3].data.push(
        chartConfig.data.datasets[3].data[idx]
      );
      chartConfig.data.labels[idx] = new Date(data['bmrs-current'].windNowDate);
      chartConfig.data.datasets[0].data[idx] = null;
      chartConfig.data.datasets[1].data[idx] = null;
      chartConfig.data.datasets[2].data[idx] =
        data['bmrs-current'].windNow * (1 - offshoreProp);
      chartConfig.data.datasets[3].data[idx] =
        data['bmrs-current'].windNow * offshoreProp;
    }

    if (bmrsData[x.Datetime] && bmrsData[x.Datetime]['Wind Onshore']) {
      chartConfig.data.datasets[2].data.push(
        bmrsData[x.Datetime]['Wind Onshore']
      );
    } else {
      chartConfig.data.datasets[2].data.push(null);
    }
    if (bmrsData[x.Datetime] && bmrsData[x.Datetime]['Wind Offshore']) {
      chartConfig.data.datasets[3].data.push(
        bmrsData[x.Datetime]['Wind Offshore']
      );
    } else {
      chartConfig.data.datasets[3].data.push(null);
    }
  });

  const ctx = document.getElementById('myChart');

  myChart = new Chart(ctx, chartConfig);
}

chartConfig = {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Wind Forecast', data: [] },
      { label: 'Capacity', data: [] },
      { label: 'Wind Onshore', data: [], fill: 'origin', yAxisID: 'y1' },
      { label: 'Wind Offshore', data: [], fill: 'origin', yAxisID: 'y1' },
    ],
  },
  options: {
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
      axis: 'x',
    },
    stacked: true,
    responsive: true,
    spanGaps: true,
    elements: {
      point: {
        radius: 0,
      },
    },
    plugins: {
      zoom: {
        limits: {
          x: { min: 'original', max: 'original' },
        },
        pan: {
          enabled: true,
          mode: 'x',
          onPanStart: (e) => {
            if (e.chart.getZoomLevel() <= 1) return false;
          },
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            millisecond: 'dd hh',
            second: 'dd hh',
            minute: 'dd hh',
            hour: 'dd hh',
            day: 'MMM dd',
            week: 'MMM dd',
            month: 'MMM',
            quarter: 'MMM',
            year: 'yyyy MMM',
          },
        },
      },
      y: {
        type: 'linear',
        display: true,
        stacked: false,
        position: 'left',
        min: 0,
        title: {
          text: 'kWH',
          display: true,
        },
        ticks: {
          callback: function (value, index, ticks) {
            return value / 1000;
          },
        },
      },
      y1: {
        type: 'linear',
        display: false,
        stacked: true,
        position: 'right',
        min: 0,
      },
    },
  },
  plugins: [
    {
      id: 'annotation',
    },
  ],
};

function genBeforeDrawFunction() {
  const currentTime = new Date();
  return function (chart) {
    var ctx = chart.ctx;
    var xaxis = chart.scales['x'];
    var yaxis = chart.scales['y'];
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(xaxis.getPixelForValue(currentTime), yaxis.top);
    //ctx.strokeStyle = 'red';
    ctx.lineTo(xaxis.getPixelForValue(currentTime), yaxis.bottom);
    ctx.stroke();
    ctx.restore();
  };
}

getLatestWindData();

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      if (registration.installing) {
        console.log('Service worker installing');
      } else if (registration.waiting) {
        console.log('Service worker installed');
      } else if (registration.active) {
        console.log('Service worker active');
      }
    } catch (error) {
      console.error(`Registration failed with ${error}`);
    }
  }
};

registerServiceWorker();
