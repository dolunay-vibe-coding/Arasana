
// ARASANA - MGM Hava Durumu API
// Dosya yolu: api/weather.js

const MGM = 'https://servis.mgm.gov.tr';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (compatible; ArasanaWeather/1.0)',
  Origin: 'https://www.mgm.gov.tr',
  Referer: 'https://www.mgm.gov.tr/'
};

const CONDITIONS = {
  PB: 'Parçalı bulutlu',
  GSY: 'Gök gürültülü sağanak yağışlı',
  HSY: 'Hafif sağanak yağışlı',
  SY: 'Sağanak yağışlı',
  A: 'Açık',
  AB: 'Az bulutlu',
  CB: 'Çok bulutlu',
  D: 'Duman',
  HY: 'Hafif yağmurlu',
  HKY: 'Hafif kar yağışlı',
  MSY: 'Yer yer sağanak yağışlı',
  KKY: 'Karla karışık yağmurlu',
  SCK: 'Sıcak',
  PUS: 'Puslu',
  Y: 'Yağmurlu',
  K: 'Kar yağışlı',
  DY: 'Dolu',
  R: 'Rüzgârlı',
  SGK: 'Soğuk',
  SIS: 'Sisli',
  KY: 'Kuvvetli yağmurlu',
  KSY: 'Kuvvetli sağanak yağışlı',
  YKY: 'Yoğun kar yağışlı',
  KGY: 'Kuvvetli gök gürültülü sağanak yağışlı'
};

function json(res, status, data) {
  return res.status(status).json(data);
}

async function getJson(url, headers = HEADERS) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Kaynak sunucu HTTP ${response.status} yanıtı verdi.`);
  }

  return response.json();
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > -9000 ? n : null;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) *
    Math.cos(rad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function weatherIcon(code) {
  if (['GSY', 'HSY', 'SY', 'MSY', 'Y', 'KY', 'KSY', 'KGY', 'DY'].includes(code)) return '🌧️';
  if (['HKY', 'KKY', 'K', 'YKY'].includes(code)) return '🌨️';
  if (['SIS', 'PUS', 'D'].includes(code)) return '🌫️';
  if (code === 'A') return '☀️';
  if (code === 'AB') return '🌤️';
  if (code === 'PB') return '⛅';
  if (code === 'CB') return '☁️';
  if (code === 'R') return '💨';
  return '🌤️';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, {
      error: 'Sadece POST istekleri kabul edilir.'
    });
  }

  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    return json(res, 400, {
      error: 'Geçerli konum koordinatları gönderilmedi.'
    });
  }

  try {
    // 1. Koordinatlardan ili bul.
    const reverseUrl = new URL(
      'https://nominatim.openstreetmap.org/reverse'
    );

    reverseUrl.searchParams.set('format', 'jsonv2');
    reverseUrl.searchParams.set('lat', latitude);
    reverseUrl.searchParams.set('lon', longitude);
    reverseUrl.searchParams.set('zoom', '10');
    reverseUrl.searchParams.set('addressdetails', '1');

    const geo = await getJson(reverseUrl.toString(), {
      'User-Agent': 'ArasanaWeather/1.0',
      'Accept-Language': 'tr'
    });

    const address = geo.address || {};
    const province =
      address.state ||
      address.province ||
      address.region ||
      address.city;

    if (!province) {
      return json(res, 502, {
        error: 'Konumunun bağlı olduğu il belirlenemedi.'
      });
    }

    // 2. MGM'den o ilin meteoroloji merkezlerini al.
    const centersUrl = new URL(`${MGM}/web/merkezler`);
    centersUrl.searchParams.set('il', province);

    const centers = await getJson(centersUrl.toString());

    if (!Array.isArray(centers) || !centers.length) {
      return json(res, 502, {
        error: 'MGM bu il için merkez bilgisi döndürmedi.'
      });
    }

    // 3. Kullanıcıya en yakın merkezi bul.
    const nearest = centers
      .filter(c =>
        c.merkezId &&
        Number.isFinite(Number(c.enlem)) &&
        Number.isFinite(Number(c.boylam))
      )
      .map(c => ({
        ...c,
        distance: distanceKm(
          latitude,
          longitude,
          Number(c.enlem),
          Number(c.boylam)
        )
      }))
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) {
      return json(res, 502, {
        error: 'Yakınında kullanılabilir MGM merkezi bulunamadı.'
      });
    }

    // 4. MGM'den gerçek güncel ölçümü al.
    const currentUrl = new URL(`${MGM}/web/sondurumlar`);
    currentUrl.searchParams.set('merkezid', nearest.merkezId);

    const rows = await getJson(currentUrl.toString());
    const current = Array.isArray(rows) ? rows[0] : null;

    if (!current || numberOrNull(current.sicaklik) === null) {
      return json(res, 502, {
        error: 'MGM güncel sıcaklık ölçümü döndürmedi.'
      });
    }

    const code = String(current.hadiseKodu || '').toUpperCase();
    const temperature = numberOrNull(current.sicaklik);
    const humidity = numberOrNull(current.nem);
    const wind = numberOrNull(current.ruzgarHiz);

    // 5. Hissedilen sıcaklığı saatlik MGM tahmininden al.
    let feelsLike = '--';

    if (nearest.saatlikTahminIstNo) {
      try {
        const hourlyUrl = new URL(`${MGM}/web/tahminler/saatlik`);
        hourlyUrl.searchParams.set(
          'istno',
          nearest.saatlikTahminIstNo
        );

        const hourly = await getJson(hourlyUrl.toString());
        const forecasts = hourly?.[0]?.tahmin || [];

        if (forecasts.length) {
          const now = Date.now();

          const closest = forecasts
            .filter(x => x.tarih)
            .sort((a, b) =>
              Math.abs(new Date(a.tarih).getTime() - now) -
              Math.abs(new Date(b.tarih).getTime() - now)
            )[0];

          const felt = numberOrNull(
            closest?.hissedilenSicaklik
          );

          if (felt !== null) feelsLike = Math.round(felt);
        }
      } catch (error) {
        // Hissedilen sıcaklık alınamazsa diğer gerçek ölçümler gösterilir.
      }
    }

    return json(res, 200, {
      temperature: Math.round(temperature * 10) / 10,
      feelsLike,
      humidity: humidity === null ? '--' : Math.round(humidity),
      windSpeed: wind === null ? '--' : Math.round(wind * 3.6),
      location: `${nearest.ilce ? nearest.ilce + ', ' : ''}${nearest.il || province}`,
      description: CONDITIONS[code] || 'Güncel hava durumu',
      icon: weatherIcon(code),
      source: 'Meteoroloji Genel Müdürlüğü',
      observationTime: current.veriZamani || null
    });

  } catch (error) {
    console.error('ARASANA MGM hatası:', error);

    return json(res, 502, {
      error: 'MGM hava durumu verisine şu anda ulaşılamıyor. Biraz sonra tekrar dene.'
    });
  }
}
