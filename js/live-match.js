
(function () {
  "use strict";

  // 2026-2027 sezonunda takip edeceğimiz takımlar.
  // Kısaltmalar, arama yapılırken takımın tam adına dönüştürülür.
  const TEAM_ALIASES = {
    "gs": "Galatasaray",
    "cimbom": "Galatasaray",
    "fb": "Fenerbahçe",
    "fener": "Fenerbahçe",
    "bjk": "Beşiktaş",
    "ts": "Trabzonspor",
    "trabzon": "Trabzonspor",
    "ads": "Adana Demirspor",
    "antep": "Gaziantep Futbol Kulübü",
    "gaziantep": "Gaziantep Futbol Kulübü",
    "goztepe": "Göztepe",
    "göztepe": "Göztepe",
    "samsun": "Samsunspor",
    "basaksehir": "İstanbul Başakşehir FK",
    "başakşehir": "İstanbul Başakşehir FK",
    "basaksehir fk": "İstanbul Başakşehir FK",
    "kocaeli": "Kocaelispor",
    "rize": "Çaykur Rizespor",
    "alanya": "Corendon Alanyaspor",
    "konya": "Tümosan Konyaspor",
    "konyaspor": "Tümosan Konyaspor",
    "eyup": "Eyüpspor",
    "eyüpspor": "Eyüpspor",
    "kasimpasa": "Kasımpaşa",
    "kasımpaşa": "Kasımpaşa",
    "genclerbirligi": "Gençlerbirliği",
    "gençlerbirliği": "Gençlerbirliği",
    "amed": "Amed Sportif Faaliyetler",
    "amedspor": "Amed Sportif Faaliyetler",
    "erzurum": "Erzurumspor FK",
    "erzurumspor": "Erzurumspor FK",
    "corum": "Arca Çorum FK",
    "çorum": "Arca Çorum FK",

    // 1. Lig takımları
    "igdir": "Alagöz Holding Iğdır FK",
    "ığdır": "Alagöz Holding Iğdır FK",
    "batman": "Batman Petrol Spor",
    "bursaspor": "Bursaspor",
    "bodrum": "Bodrum FK",
    "bandirma": "Bandırmaspor",
    "bandırma": "Bandırmaspor",
    "sivas": "Sivasspor",
    "umraniye": "Ümraniyespor",
    "ümraniye": "Ümraniyespor",
    "ankara keci": "Ankara Keçiörengücü",
    "kecioren": "Ankara Keçiörengücü",
    "keçiören": "Ankara Keçiörengücü",
    "manisa": "Manisa FK",
    "mardin": "Mardin 1969 Spor",
    "kayseri": "Kayserispor",
    "karagumruk": "Fatih Karagümrük",
    "karagümrük": "Fatih Karagümrük",
    "mugla": "Muğlaspor",
    "muğla": "Muğlaspor",
    "pendik": "Pendikspor",
    "sariyer": "Sarıyer",
    "sarıyer": "Sarıyer",
    "van": "Van Spor FK",
    "esenler erok": "Esenler Erokspor"
  };

  const TEAM_NAMES = [
    "Galatasaray",
    "Fenerbahçe",
    "Beşiktaş",
    "Trabzonspor",
    "Amed Sportif Faaliyetler",
    "Erzurumspor FK",
    "Arca Çorum FK",
    "Gaziantep Futbol Kulübü",
    "Göztepe",
    "Samsunspor",
    "İstanbul Başakşehir FK",
    "Kocaelispor",
    "Çaykur Rizespor",
    "Corendon Alanyaspor",
    "Tümosan Konyaspor",
    "Eyüpspor",
    "Kasımpaşa",
    "Gençlerbirliği",
    "Alagöz Holding Iğdır FK",
    "Batman Petrol Spor",
    "Bursaspor",
    "Bodrum FK",
    "Bandırmaspor",
    "Sivasspor",
    "Ümraniyespor",
    "Ankara Keçiörengücü",
    "Manisa FK",
    "Mardin 1969 Spor",
    "Kayserispor",
    "Fatih Karagümrük",
    "Muğlaspor",
    "Pendikspor",
    "Sarıyer",
    "Van Spor FK",
    "Esenler Erokspor"
  ];

  const STOP_WORDS = [
    "mac", "maci", "maclar", "skor", "skoru",
    "canli", "futbol", "sonuc", "sonuclari",
    "bugun", "bugunku", "kac", "kacta",
    "mi", "mu", "match", "live", "football",
    "score", "scores", "nedir", "ne", "oldu",
    "bitti", "fikstur", "fiksturu", "takim",
    "takimi", "takimin", "sonuclari"
  ];

  function normalize(value = "") {
    return String(value)
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function expandTeamAliases(query) {
    let result = ` ${normalize(query)} `;

    const aliases = Object.entries(TEAM_ALIASES)
      .map(([alias, fullName]) => ({
        alias: normalize(alias),
        fullName
      }))
      .sort((a, b) => b.alias.length - a.alias.length);

    aliases.forEach(item => {
      const escaped = item.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`\\b${escaped}\\b`, "g");

      result = result.replace(pattern, normalize(item.fullName));
    });

    return result.replace(/\s+/g, " ").trim();
  }

  function containsKnownTeam(query) {
    const q = normalize(query);

    const aliases = Object.keys(TEAM_ALIASES);

    return aliases.some(alias => {
      const normalizedAlias = normalize(alias);
      return new RegExp(
        `(^| )${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`
      ).test(q);
    }) || TEAM_NAMES.some(name => {
      return q.includes(normalize(name));
    });
  }

  function isMatchQuery(query) {
    const q = normalize(query);

    const footballIntent =
      /\b(mac|maci|maclar|skor|canli|futbol|football|match|score|kac kac|sonuc|fikstur)\b/
        .test(q);

    return footballIntent || containsKnownTeam(q);
  }

  function safeImage(url) {
    if (!url) return "";

    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function getStatus(match) {
    const status = String(match.status || "").toUpperCase();
    const period = String(match.period || "").toUpperCase();

    if (
      status.includes("FINISHED") ||
      status === "FT" ||
      period === "FINISHED"
    ) {
      return { label: "MAÇ SONU", type: "finished" };
    }

    if (period === "HALF_TIME" || status.includes("HALF TIME")) {
      return { label: "DEVRE ARASI", type: "break" };
    }

    if (period === "EXTRA_TIME") {
      return { label: "UZATMA", type: "live" };
    }

    if (period === "PENALTIES") {
      return { label: "PENALTILAR", type: "live" };
    }

    if (
      status === "LIVE" ||
      period === "FIRST_HALF" ||
      period === "SECOND_HALF"
    ) {
      return { label: "CANLI", type: "live" };
    }

    return { label: status || "MAÇ DURUMU", type: "normal" };
  }

  function renderTeam(name, badge) {
    const image = safeImage(badge);

    return `
      <div class="ars-live-team">
        ${
          image
            ? `<img class="ars-live-team-logo"
                    src="${escapeHTML(image)}"
                    alt=""
                    loading="lazy">`
            : `<div class="ars-live-team-placeholder">⚽</div>`
        }
        <span>${escapeHTML(name)}</span>
      </div>
    `;
  }

  function renderMatch(match) {
    const status = getStatus(match);
    const homeScore = match.homeScore ?? "-";
    const awayScore = match.awayScore ?? "-";

    let clock = status.label;

    if (status.type === "live" && match.minute !== null) {
      clock = `${escapeHTML(match.minute)}'`;

      if (match.extra !== null && match.extra !== undefined) {
        clock += ` +${escapeHTML(match.extra)}`;
      }
    }

    return `
      <article class="ars-live-match">
        <div class="ars-live-match-top">
          <div class="ars-live-brand">ARASANA LIVE</div>
          <span class="ars-live-status ${status.type}">
            ${escapeHTML(status.label)}
          </span>
        </div>

        <div class="ars-live-league">
          ${escapeHTML(match.country || "")}
          ${match.country && match.league ? " · " : ""}
          ${escapeHTML(match.league || "Futbol")}
        </div>

        <div class="ars-live-match-main">
          <div class="ars-live-teams">
            ${renderTeam(match.homeTeam, match.homeBadge)}
            ${renderTeam(match.awayTeam, match.awayBadge)}
          </div>

          <div class="ars-live-score-area">
            <div class="ars-live-score">
              ${escapeHTML(homeScore)}
              <span>:</span>
              ${escapeHTML(awayScore)}
            </div>

            <div class="ars-live-clock ${status.type}">
              ${clock}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  async function start(query) {
    const answerArea = document.getElementById("answerArea");

    if (!answerArea || !isMatchQuery(query)) return;

    const expandedQuery = expandTeamAliases(query);

    try {
      const response = await fetch(
        `/api/live-match?q=${encodeURIComponent(expandedQuery)}`,
        { method: "GET" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Maç bilgileri alınamadı.");
      }

      let html = `
        <section class="ars-live-container"
                 aria-label="Futbol maç bilgileri">

          <div class="ars-live-heading">
            <div>
              <div class="ars-live-heading-title">ARASANA LIVE</div>
              <div class="ars-live-heading-subtitle">
                ${escapeHTML(query)} için maç bilgileri
              </div>
            </div>

            <button class="ars-live-refresh" type="button">
              Yenile
            </button>
          </div>
      `;

      if (data.matches && data.matches.length) {
        html += data.matches.map(renderMatch).join("");
      } else {
        html += `
          <div class="ars-live-empty">
            Bu takımla eşleşen şu anki canlı veya bugünkü tamamlanmış
            maç bulunamadı.
            <br>
            Yaklaşan maçlar ve sezon sonuçları sonraki geliştirme
            aşamasında eklenecek.
          </div>
        `;
      }

      html += `
          <div class="ars-live-source">
            Veri kaynağı: GOAL API
          </div>
        </section>
      `;

      answerArea.insertAdjacentHTML("afterbegin", html);

      const container = answerArea.querySelector(
        ".ars-live-container"
      );

      container.querySelectorAll(".ars-live-team-logo")
        .forEach(image => {
          image.addEventListener("error", () => {
            image.style.display = "none";
          }, { once: true });
        });

      container.querySelector(".ars-live-refresh")
        ?.addEventListener("click", async event => {
          const button = event.currentTarget;

          button.disabled = true;
          button.textContent = "Yükleniyor...";

          container.remove();
          await start(query);
        });

    } catch (error) {
      console.error("ARASANA LIVE:", error);

      answerArea.insertAdjacentHTML("afterbegin", `
        <div class="ars-live-error">
          Maç bilgileri şu anda getirilemiyor.
          Biraz sonra tekrar deneyebilirsin.
        </div>
      `);
    }
  }

  window.ArasanaLiveMatch = {
    isMatchQuery,
    expandTeamAliases,
    start
  };
})();
