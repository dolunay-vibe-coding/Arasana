
(() => {
  const API = "/api/prayer";

  // Namaz aramalarını tanı
  function isPrayerSearch(query) {
    return /namaz|ezan|imsak|iftar|sahur|vakitleri/i.test(query);
  }

  // Namaz kartının HTML tasarımı
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

        <div class="prayer-source">
          Veri kaynağı: Diyanet verileri
        </div>
      `;
    }

    const area = document.getElementById("answerArea");
    if (area) area.prepend(card);

    return card;
  }

  // API üzerinden illeri getir
  async function getCities() {
    const response = await fetch(`${API}?action=cities`);
    const result = await response.json();

    if (!result.ok) throw new Error("İller alınamadı.");

    return result.data;
  }

  // İlçeleri getir
  async function getDistricts(cityId) {
    const response = await fetch(
      `${API}?action=districts&cityId=${encodeURIComponent(cityId)}`
    );

    const result = await response.json();

    if (!result.ok) throw new Error("İlçeler alınamadı.");

    return result.data;
  }

  // Namaz vakitlerini getir
  async function getTimes(districtId) {
    const response = await fetch(
      `${API}?action=times&districtId=${encodeURIComponent(districtId)}`
    );

    const result = await response.json();

    if (!result.ok) throw new Error("Vakitler alınamadı.");

    return result.data;
  }

  // Dışarıdan kullanılacak fonksiyonlar
  window.ArasanaPrayer = {
    isPrayerSearch,
    createPrayerCard,
    getCities,
    getDistricts,
    getTimes
  };
})();
