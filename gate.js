// Вход в офис по паролю. Это заставка, а не защита: код страницы открыт.
// В файле хранится только SHA-256 пароля. Сменить пароль: заменить HASH на
//   python -c "import hashlib;print(hashlib.sha256('новый пароль'.encode()).hexdigest())"
// Когда офис подключится к настоящим данным (этап 4), доступ будет закрыт токеном на сервере.

(() => {
  const HASH = "885974b3f8e79fff03ab45389f206b8a32b530f32daee1a410f5a3c52321da34";
  const KEY = "etb-office-gate";
  try {
    if (sessionStorage.getItem(KEY) === HASH) return;
  } catch (e) { /* хранилище недоступно — спросим пароль */ }

  const gate = document.createElement("div");
  gate.className = "gate";
  gate.innerHTML = `<form autocomplete="off">
      <b>etb.ai</b>
      <span>виртуальный офис</span>
      <input type="password" placeholder="Пароль" aria-label="Пароль" autofocus>
      <button type="submit">Войти</button>
      <p role="alert"></p>
    </form>`;
  document.documentElement.classList.add("locked");
  document.body.appendChild(gate);

  const input = gate.querySelector("input");
  const error = gate.querySelector("p");
  gate.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.value));
    const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== HASH) {
      error.textContent = "Неверный пароль";
      input.select();
      return;
    }
    try {
      sessionStorage.setItem(KEY, HASH);
    } catch (err) { /* не запомним до закрытия вкладки — не страшно */ }
    document.documentElement.classList.remove("locked");
    gate.remove();
  });
})();
