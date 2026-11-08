// ARASANA - 10 Kasım Atatürk'ü Anma Ekranı
// Dosya yolu: js/anma.js
// Gösterim aralığı: her yıl 8 - 10 Kasım (aşağıdan değiştirilebilir)
// Test için adrese ?anma=1 ekleyin (tarihe bakmadan gösterir).

(() => {
  const START = { month: 11, day: 8 };   // başlangıç: 8 Kasım
  const END   = { month: 11, day: 10 };  // bitiş: 10 Kasım (gün sonuna kadar)
  const SESSION_KEY = "arasana-anma-gorundu";

  const now = new Date();
  const forced = /[?&]anma=1\b/.test(location.search);

  const key = (m, d) => m * 100 + d;
  const today = key(now.getMonth() + 1, now.getDate());
  const inRange = today >= key(START.month, START.day) &&
                  today <= key(END.month, END.day);

  if (!forced && !inRange) return;

  try {
    if (!forced && sessionStorage.getItem(SESSION_KEY)) return;
  } catch {}

  const isTenth = today === key(11, 10);

  const css = `
  #anma-overlay{
    position:fixed; inset:0; z-index:99999;
    display:flex; align-items:center; justify-content:center;
    padding:24px;
    background:#000;
    color:#f2f0f5;
    font-family:'Plus Jakarta Sans', system-ui, sans-serif;
    text-align:center;
    opacity:0; transition:opacity .9s ease;
    overflow-y:auto;
  }
  #anma-overlay.show{ opacity:1; }
  #anma-overlay.hide{ opacity:0; pointer-events:none; transition:opacity .6s ease; }

  .anma-box{
    max-width:760px; width:100%;
    display:flex; flex-direction:column; align-items:center; gap:14px;
    transform:translateY(14px); transition:transform 1.1s ease .15s;
  }
  #anma-overlay.show .anma-box{ transform:none; }

  .anma-photo{
    margin:0; width:100%; display:flex; justify-content:center; position:relative;
  }
  .anma-photo img{
    display:block; width:auto; max-width:100%; max-height:46vh; height:auto;
    -webkit-mask-image:radial-gradient(ellipse 70% 74% at 50% 48%, #000 60%, transparent 100%);
            mask-image:radial-gradient(ellipse 70% 74% at 50% 48%, #000 60%, transparent 100%);
    opacity:0; transition:opacity 1.4s ease .2s;
  }
  .anma-photo::after{
    content:""; position:absolute; left:0; right:0; bottom:0; height:38%;
    background:linear-gradient(to bottom, rgba(0,0,0,0), #000 92%);
    pointer-events:none;
  }
  #anma-overlay.show .anma-photo img{ opacity:1; }

  .anma-date{
    font-size:13px; font-weight:700; letter-spacing:3px;
    color:#E30A17;
  }
  .anma-title{
    margin:0;
    font-family:'Baloo 2', 'Plus Jakarta Sans', sans-serif;
    font-size:clamp(34px, 7vw, 54px);
    font-weight:800; line-height:1.1;
    color:#fff;
  }
  .anma-line{
    width:64px; height:2px; border-radius:2px;
    background:linear-gradient(90deg, transparent, #E30A17, transparent);
    width:140px;
  }
  .anma-text{
    margin:0; max-width:560px;
    font-size:clamp(15px, 3.6vw, 18px);
    line-height:1.7;
    color:#d9d4e2;
  }
  .anma-note{
    margin:0;
    font-size:13px;
    color:#9b94a8;
  }
  .anma-btn{
    margin-top:10px;
    appearance:none; cursor:pointer;
    border:1px solid rgba(255,255,255,.25);
    background:rgba(255,255,255,.06);
    color:#fff;
    font:inherit; font-size:15px; font-weight:700;
    padding:13px 34px; border-radius:999px;
    transition:background .25s, border-color .25s, transform .2s;
  }
  .anma-btn:hover{ background:rgba(227,10,23,.85); border-color:#E30A17; }
  .anma-btn:active{ transform:scale(.97); }
  .anma-btn:focus-visible{ outline:2px solid rgba(255,255,255,.5); outline-offset:3px; }
  body.anma-lock{ overflow:hidden; }
  `;

  const photo = `
  <figure class="anma-photo">
    <img src="/img/ataturk.jpg" alt="Gazi Mustafa Kemal Atatürk" decoding="async">
  </figure>`;

  function build() {
    const pre = new Image();
    pre.src = "/img/ataturk.jpg";

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "anma-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "10 Kasım Atatürk'ü Anma");

    overlay.innerHTML = `
      <div class="anma-box">
        ${photo}
        <div class="anma-date">10 KASIM 1938</div>
        <h1 class="anma-title">Saygı, Minnet<br>ve Özlemle</h1>
        <div class="anma-line"></div>
        <p class="anma-text">
          Cumhuriyetimizin kurucusu Gazi Mustafa Kemal Atatürk'ü ve
          silah arkadaşlarını, vefatının yıl dönümünde rahmet, saygı ve
          minnetle anıyoruz.
        </p>
        ${isTenth ? `<p class="anma-note">Bugün saat 09.05'te bir dakikalık saygı duruşu yapılır.</p>` : ``}
        <button class="anma-btn" id="anma-continue" type="button">Siteye Geç</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.classList.add("anma-lock");

    requestAnimationFrame(() =>
      requestAnimationFrame(() => overlay.classList.add("show"))
    );

    const btn = overlay.querySelector("#anma-continue");
    btn.focus({ preventScroll: true });

    function close() {
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
      overlay.classList.add("hide");
      document.body.classList.remove("anma-lock");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => overlay.remove(), 700);
    }

    function onKey(e) {
      if (e.key === "Escape" || e.key === "Enter") close();
    }

    btn.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
