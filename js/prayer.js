
(() => {
  const API = "/api/prayer";
  let countdownTimer = null;
  let citiesCache = null;
  const STORE_KEY = "arasana-prayer-location";

  const saveLocation = loc => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(loc)); } catch {}
  };
  const readLocation = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
    catch { return null; }
  };
  const clearLocation = () => {
    try { localStorage.removeItem(STORE_KEY); } catch {}
  };

  const prayerNames = [
    ["İmsak", "Imsak"],
    ["Güneş", "Gunes"],
    ["Öğle", "Ogle"],
    ["İkindi", "Ikindi"],
    ["Akşam", "Aksam"],
    ["Yatsı", "Yatsi"]
  ];

  const normalize = value =>
    String(value || "")
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .trim();

  function isPrayerSearch(query) {
    return /namaz|ezan|imsak|iftar|sahur|vakitleri/i.test(query);
  }

  function createPrayerCard() {
    let card = document.getElementById("arasana-prayer");

    if (!card) {
      card = document.createElement("section");
      card.id = "arasana-prayer";
      card.className = "arasana-prayer";

      card.innerHTML = `
        <div class="prayer-header">
          <div>
            <strong>🌙 ARASANA PRAYER</strong>
            <div id="prayer-location">Konum belirleniyor...</div>
            <small id="prayer-date"></small>
            <button type="button" class="prayer-change" id="prayer-change">📍 Konumu değiştir</button>
          </div>
          <span>VAKİTLER</span>
        </div>

        <div id="prayer-message">Namaz vakitleri yükleniyor...</div>
        <div class="prayer-times" id="prayer-times"></div>

        <div class="prayer-next">
          <small>SONRAKİ NAMAZ</small>
          <strong id="prayer-next-name">--</strong>
          <div id="prayer-countdown">--:--:--</div>
        </div>

        <div class="prayer-manual" id="prayer-manual"></div>
        <div class="prayer-source">Veri kaynağı: Diyanet verileri</div>
      `;
    }

    const area = document.getElementById("answerArea");
    if (area && card.parentElement !== area) area.prepend(card);

    return card;
  }

  async function api(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("API bağlantısı başarısız.");
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "Veri alınamadı.");
    return result.data;
  }

  async function getCities() {
    return api(`${API}?action=cities`);
  }

  async function getDistricts(cityId) {
    return api(`${API}?action=districts&cityId=${encodeURIComponent(cityId)}`);
  }

  async function getTimes(districtId) {
    return api(`${API}?action=times&districtId=${encodeURIComponent(districtId)}`);
  }

  function showMessage(message) {
    const el = document.getElementById("prayer-message");
    if (el) el.textContent = message;
  }

  function showManual(cities) {
    const area = document.getElementById("prayer-manual");
    if (!area) return;

    area.innerHTML = `
      <div>
        <p>Konumunuzu seçerek devam edin:</p>
        <select id="prayer-city">
          <option value="">İl seçin</option>
          ${cities.map(c =>
            `<option value="${c.SehirID}">${c.SehirAdi}</option>`
          ).join("")}
        </select>
        <select id="prayer-district">
          <option value="">Önce il seçin</option>
        </select>
        <button type="button" class="prayer-auto" id="prayer-auto">Otomatik konuma dön</button>
      </div>
    `;

    const citySelect = document.getElementById("prayer-city");
    const districtSelect = document.getElementById("prayer-district");

    citySelect.addEventListener("change", async () => {
      districtSelect.innerHTML = `<option value="">İlçeler yükleniyor...</option>`;

      try {
        const districts = await getDistricts(citySelect.value);
        districtSelect.innerHTML =
          `<option value="">İlçe seçin</option>` +
          districts.map(d =>
            `<option value="${d.IlceID}">${d.IlceAdi}</option>`
          ).join("");
      } catch {
        districtSelect.innerHTML = `<option value="">İlçeler alınamadı</option>`;
      }
    });

    districtSelect.addEventListener("change", async () => {
      if (districtSelect.value) {
        await loadDistrict(
          districtSelect.value,
          citySelect.options[citySelect.selectedIndex].text,
          districtSelect.options[districtSelect.selectedIndex].text,
          true
        );
        area.innerHTML = "";
      }
    });

    document.getElementById("prayer-auto").addEventListener("click", () => {
      clearLocation();
      area.innerHTML = "";
      start();
    });
  }

  async function locateDistrict(latitude, longitude, cities) {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
    url.searchParams.set("zoom", "10");
    url.searchParams.set("accept-language", "tr");

    const response = await fetch(url);
    if (!response.ok) throw new Error("Konum adresi bulunamadı.");

    const result = await response.json();
    const address = result.address || {};

    const cityName =
      address.province ||
      address.state ||
      address.city ||
      address.town;

    const districtName =
      address.city_district ||
      address.district ||
      address.town ||
      address.suburb ||
      address.city;

    const city = cities.find(c =>
      normalize(c.SehirAdi) === normalize(cityName)
    );

    if (!city) throw new Error("Bulunduğunuz il eşleştirilemedi.");

    const districts = await getDistricts(city.SehirID);

    let district = districts.find(d =>
      normalize(d.IlceAdi) === normalize(districtName)
    );

    if (!district) {
      district = districts.find(d =>
        normalize(d.IlceAdi) === normalize(address.city)
      );
    }

    // Diyanet'te ilçe adı yoksa il merkezi ilçesini kullan
    if (!district) {
      district = districts.find(d =>
        normalize(d.IlceAdi) === normalize(city.SehirAdi) ||
        normalize(d.IlceAdi) === "merkez"
      );
    }

    if (!district) throw new Error("İlçeniz eşleştirilemedi.");

    return { city, district };
  }

  function getTodayRecord(records) {
    const today = new Date();
    const date = [
      String(today.getDate()).padStart(2, "0"),
      String(today.getMonth() + 1).padStart(2, "0"),
      today.getFullYear()
    ].join(".");

    return records.find(r => r.MiladiTarihKisa === date);
  }

  function updateCountdown(record) {
    const now = new Date();
    const prayers = prayerNames.map(([name, key]) => {
      const [hours, minutes] = record[key].split(":").map(Number);
      const date = new Date(now);
      date.setHours(hours, minutes, 0, 0);
      return { name, date };
    });

    let next = prayers.find(p => p.date > now);

    if (!next) {
      next = {
        name: "İmsak",
        date: new Date(now)
      };
      next.date.setDate(next.date.getDate() + 1);
      const [h, m] = record.Imsak.split(":").map(Number);
      next.date.setHours(h, m, 0, 0);
    }

    const seconds = Math.max(0, Math.floor((next.date - now) / 1000));
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");

    document.getElementById("prayer-next-name").textContent = next.name;
    document.querySelectorAll(".prayer-time").forEach(el =>
      el.classList.toggle("is-next", el.dataset.name === next.name)
    );
    document.getElementById("prayer-countdown").textContent =
      `${hours}:${minutes}:${secs}`;
  }

  async function loadDistrict(districtId, cityName, districtName, save = false) {
    showMessage("Namaz vakitleri getiriliyor...");

    try {
      const records = await getTimes(districtId);
      const record = getTodayRecord(records);

      if (!record) throw new Error("Bugünün vakitleri bulunamadı.");

      document.getElementById("prayer-location").textContent =
        `${cityName} / ${districtName}`;

      document.getElementById("prayer-date").textContent =
        record.MiladiTarihUzun || record.MiladiTarihKisa;

      document.getElementById("prayer-times").innerHTML =
        prayerNames.map(([name, key]) => `
          <div class="prayer-time" data-name="${name}">
            <span>${name}</span>
            <strong>${record[key]}</strong>
          </div>
        `).join("");

      showMessage("");
      if (save) saveLocation({ districtId, cityName, districtName });

      if (countdownTimer) clearInterval(countdownTimer);
      updateCountdown(record);
      countdownTimer = setInterval(() => updateCountdown(record), 1000);
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function toggleManual() {
    const area = document.getElementById("prayer-manual");
    if (!area) return;

    if (area.innerHTML.trim()) {
      area.innerHTML = "";
      return;
    }

    try {
      if (!citiesCache) citiesCache = await getCities();
      showManual(citiesCache);
    } catch {
      showMessage("İl listesi alınamadı. Daha sonra tekrar deneyin.");
    }
  }

  async function start() {
    createPrayerCard();

    const changeBtn = document.getElementById("prayer-change");
    if (changeBtn) changeBtn.onclick = toggleManual;

    // Daha önce elle seçilmiş konum varsa onu kullan
    const saved = readLocation();
    if (saved && saved.districtId) {
      showMessage("Namaz vakitleri getiriliyor...");
      await loadDistrict(saved.districtId, saved.cityName, saved.districtName);
      return;
    }

    showMessage("Konum izni bekleniyor...");

    let cities;

    try {
      cities = citiesCache || await getCities();
      citiesCache = cities;
    } catch (error) {
      showMessage("İl listesi alınamadı. Daha sonra tekrar deneyin.");
      return;
    }

    if (!navigator.geolocation) {
      showMessage("Konum özelliği desteklenmiyor.");
      showManual(cities);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          showMessage("İl ve ilçeniz belirleniyor...");

          const found = await locateDistrict(
            position.coords.latitude,
            position.coords.longitude,
            cities
          );

          await loadDistrict(
            found.district.IlceID,
            found.city.SehirAdi,
            found.district.IlceAdi
          );
        } catch (error) {
          showMessage(error.message + " Konumunuzu elle seçebilirsiniz.");
          showManual(cities);
        }
      },
      () => {
        showMessage("Konum izni alınamadı. İl ve ilçenizi seçin.");
        showManual(cities);
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 300000
      }
    );
  }

  window.ArasanaPrayer = {
    isPrayerSearch,
    start,
    getCities,
    getDistricts,
    getTimes
  };
})();
