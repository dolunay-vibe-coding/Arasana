// ARASANA - Bilimsel Hesap Makinesi
// Dosya yolu: js/calc.js
// "hesap makinesi / makinası / hesaplayıcı / calculator" aramalarında
// sonuçların en üstünde gösterilir. eval() kullanılmaz.

(() => {
  let useDeg = true;   // Derece / Radyan
  let lastAnswer = 0;

  /* ---------- Arama algılama ---------- */
  function isCalcSearch(query) {
    return /hesap\s*makin|bilimsel\s*hesap|hesaplay[ıi]c[ıi]|calculator/i.test(
      String(query || "")
    );
  }

  /* ---------- İfade çözücü ---------- */
  const FUNCS = {
    sin:  x => Math.sin(useDeg ? x * Math.PI / 180 : x),
    cos:  x => Math.cos(useDeg ? x * Math.PI / 180 : x),
    tan:  x => Math.tan(useDeg ? x * Math.PI / 180 : x),
    asin: x => (useDeg ? 180 / Math.PI : 1) * Math.asin(x),
    acos: x => (useDeg ? 180 / Math.PI : 1) * Math.acos(x),
    atan: x => (useDeg ? 180 / Math.PI : 1) * Math.atan(x),
    ln:   Math.log,
    log:  Math.log10,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs:  Math.abs,
    exp:  Math.exp
  };

  function tokenize(src) {
    const s = src
      .replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-")
      .replace(/,/g, ".").replace(/\s+/g, "");
    const tokens = [];
    let i = 0;

    while (i < s.length) {
      const rest = s.slice(i);
      let m;

      if ((m = rest.match(/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/))) {
        tokens.push({ t: "num", v: parseFloat(m[0]) });
        i += m[0].length;
      } else if ((m = rest.match(/^(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|abs|exp)/))) {
        tokens.push({ t: "fn", v: m[1] });
        i += m[1].length;
      } else if (rest[0] === "√") {
        tokens.push({ t: "fn", v: "sqrt" });
        i += 1;
      } else if (rest[0] === "π" || rest.startsWith("pi")) {
        tokens.push({ t: "num", v: Math.PI });
        i += rest[0] === "π" ? 1 : 2;
      } else if (rest[0] === "e") {
        tokens.push({ t: "num", v: Math.E });
        i += 1;
      } else if (rest.startsWith("Ans")) {
        tokens.push({ t: "num", v: lastAnswer });
        i += 3;
      } else if ("+-*/^!%()".includes(rest[0])) {
        tokens.push({ t: "op", v: rest[0] });
        i += 1;
      } else {
        throw new Error("Geçersiz karakter: " + rest[0]);
      }
    }
    return tokens;
  }

  function factorial(n) {
    if (n < 0 || !Number.isInteger(n)) throw new Error("n! yalnızca tam sayılarda");
    if (n > 170) return Infinity;
    let r = 1;
    for (let k = 2; k <= n; k++) r *= k;
    return r;
  }

  function evaluate(src) {
    const tokens = tokenize(src);
    let pos = 0;

    const peek = () => tokens[pos];
    const isOp = v => peek() && peek().t === "op" && peek().v === v;
    const startsFactor = () => {
      const t = peek();
      return t && (t.t === "num" || t.t === "fn" || (t.t === "op" && t.v === "("));
    };

    function expr() {
      let left = term();
      while (isOp("+") || isOp("-")) {
        const op = tokens[pos++].v;
        const right = term();
        left = op === "+" ? left + right : left - right;
      }
      return left;
    }

    function term() {
      let left = unary();
      for (;;) {
        if (isOp("*") || isOp("/")) {
          const op = tokens[pos++].v;
          const right = unary();
          if (op === "/" && right === 0) throw new Error("Sıfıra bölme");
          left = op === "*" ? left * right : left / right;
        } else if (startsFactor()) {          // 2π, 3(4+1), 2sin(30)
          left *= unary();
        } else break;
      }
      return left;
    }

    function unary() {
      if (isOp("-")) { pos++; return -unary(); }
      if (isOp("+")) { pos++; return unary(); }
      return power();
    }

    function power() {
      const base = postfix();
      if (isOp("^")) {
        pos++;
        return Math.pow(base, unary());       // sağdan birleşimli
      }
      return base;
    }

    function postfix() {
      let v = primary();
      while (isOp("!") || isOp("%")) {
        v = tokens[pos++].v === "!" ? factorial(v) : v / 100;
      }
      return v;
    }

    function primary() {
      const t = tokens[pos++];
      if (!t) throw new Error("İfade eksik");

      if (t.t === "num") return t.v;

      if (t.t === "fn") {
        if (!isOp("(")) throw new Error(t.v + " için ( gerekli");
        pos++;
        const arg = expr();
        if (isOp(")")) pos++;                 // eksik ) kabul edilir
        return FUNCS[t.v](arg);
      }

      if (t.t === "op" && t.v === "(") {
        const v = expr();
        if (isOp(")")) pos++;
        return v;
      }

      throw new Error("Beklenmeyen: " + t.v);
    }

    const result = expr();
    if (pos < tokens.length) throw new Error("İfade çözülemedi");
    if (Number.isNaN(result)) throw new Error("Tanımsız");
    return result;
  }

  function format(n) {
    if (!Number.isFinite(n)) return n > 0 ? "∞" : n < 0 ? "-∞" : "Tanımsız";
    if (Math.abs(n) < 1e-12) return "0";      // cos(90) gibi yuvarlama hataları
    const abs = Math.abs(n);
    if (abs >= 1e15 || abs < 1e-6) {
      return Number(n.toPrecision(10)).toExponential().replace("e+", "E").replace("e", "E");
    }
    return String(Number(n.toPrecision(12)));
  }

  /* ---------- Arayüz ---------- */
  // [etiket, eklenecek metin, sınıf]
  const KEYS = [
    ["DEG", "@mode", "k-mode"], ["(", "(", "k-op"], [")", ")", "k-op"], ["AC", "@clear", "k-clear"], ["⌫", "@back", "k-clear"],
    ["sin", "sin(", "k-fn"], ["cos", "cos(", "k-fn"], ["tan", "tan(", "k-fn"], ["π", "π", "k-fn"], ["e", "e", "k-fn"],
    ["asin", "asin(", "k-fn"], ["acos", "acos(", "k-fn"], ["atan", "atan(", "k-fn"], ["x²", "^2", "k-fn"], ["xʸ", "^", "k-fn"],
    ["ln", "ln(", "k-fn"], ["log", "log(", "k-fn"], ["√", "√(", "k-fn"], ["n!", "!", "k-fn"], ["1/x", "1/(", "k-fn"],
    ["7", "7", "k-num"], ["8", "8", "k-num"], ["9", "9", "k-num"], ["÷", "÷", "k-op"], ["%", "%", "k-op"],
    ["4", "4", "k-num"], ["5", "5", "k-num"], ["6", "6", "k-num"], ["×", "×", "k-op"], ["Ans", "Ans", "k-fn"],
    ["1", "1", "k-num"], ["2", "2", "k-num"], ["3", "3", "k-num"], ["−", "−", "k-op"], ["EXP", "E", "k-fn"],
    ["0", "0", "k-num"], ["00", "00", "k-num"], [".", ".", "k-num"], ["+", "+", "k-op"], ["=", "@equals", "k-equals"]
  ];

  function createCard() {
    let card = document.getElementById("arasana-calc");

    if (!card) {
      card = document.createElement("section");
      card.id = "arasana-calc";
      card.className = "arasana-calc";

      card.innerHTML = `
        <div class="calc-header">
          <strong>🧮 ARASANA CALC</strong>
          <span>BİLİMSEL</span>
        </div>
        <div class="calc-screen">
          <div class="calc-history" id="calc-history">&nbsp;</div>
          <input id="calc-input" class="calc-input" type="text"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 placeholder="0" aria-label="Hesaplanacak ifade">
          <div class="calc-preview" id="calc-preview">&nbsp;</div>
        </div>
        <div class="calc-keys" id="calc-keys">
          ${KEYS.map(([label, val, cls]) =>
            `<button type="button" class="calc-key ${cls}" data-v="${val}">${label}</button>`
          ).join("")}
        </div>
      `;
    }

    const area = document.getElementById("answerArea");
    if (area && card.parentElement !== area) area.prepend(card);
    return card;
  }

  function start() {
    const card = createCard();
    const input = card.querySelector("#calc-input");
    const history = card.querySelector("#calc-history");
    const preview = card.querySelector("#calc-preview");
    const modeBtn = card.querySelector('[data-v="@mode"]');

    // Dokunmatik cihazlarda ekran klavyesi açılmasın
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
      input.readOnly = true;
    }

    const refreshMode = () => { modeBtn.textContent = useDeg ? "DEG" : "RAD"; };

    function updatePreview() {
      const text = input.value.trim();
      if (!text) { preview.innerHTML = "&nbsp;"; preview.classList.remove("is-error"); return; }
      try {
        preview.textContent = "= " + format(evaluate(text));
        preview.classList.remove("is-error");
      } catch {
        preview.innerHTML = "&nbsp;";
      }
    }

    function insert(text) {
      input.focus({ preventScroll: true });
      const s = input.selectionStart ?? input.value.length;
      const e = input.selectionEnd ?? input.value.length;
      input.setRangeText(text, s, e, "end");
      updatePreview();
    }

    function equals() {
      const text = input.value.trim();
      if (!text) return;
      try {
        const result = evaluate(text);
        const shown = format(result);
        history.textContent = text + " =";
        lastAnswer = Number.isFinite(result) ? result : 0;
        input.value = shown === "Tanımsız" ? "" : shown;
        preview.innerHTML = "&nbsp;";
        preview.classList.remove("is-error");
      } catch (error) {
        preview.textContent = error.message;
        preview.classList.add("is-error");
      }
    }

    function press(v) {
      if (v === "@mode") { useDeg = !useDeg; refreshMode(); updatePreview(); }
      else if (v === "@clear") { input.value = ""; history.innerHTML = "&nbsp;"; updatePreview(); }
      else if (v === "@back") {
        const s = input.selectionStart ?? input.value.length;
        const e = input.selectionEnd ?? input.value.length;
        if (s !== e) input.setRangeText("", s, e, "end");
        else if (s > 0) input.setRangeText("", s - 1, s, "end");
        updatePreview();
      }
      else if (v === "@equals") equals();
      else insert(v);
    }

    card.querySelector("#calc-keys").onclick = event => {
      const btn = event.target.closest("button[data-v]");
      if (btn) press(btn.dataset.v);
    };

    input.oninput = updatePreview;
    input.onkeydown = event => {
      if (event.key === "Enter") { event.preventDefault(); equals(); }
      else if (event.key === "Escape") { press("@clear"); }
      event.stopPropagation();   // sayfadaki kısayollar karışmasın
    };

    refreshMode();
  }

  window.ArasanaCalc = { isCalcSearch, start, evaluate, format };
})();
