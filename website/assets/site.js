/*
 * Everything this site needs from JavaScript, which is almost nothing.
 *
 * The navigation, every link and all of the content work with scripting turned
 * off. This adds the small mobile menu and closes it again, and nothing else.
 * No analytics, no consent banner, no third party anything: see /cookies/.
 */
(() => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (!toggle || !links) return;

  const small = window.matchMedia("(max-width: 880px)");
  const apply = () => {
    if (small.matches) {
      links.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    } else {
      links.hidden = false;
    }
  };
  apply();
  small.addEventListener("change", apply);

  toggle.addEventListener("click", () => {
    const open = links.hidden;
    links.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });

  links.addEventListener("click", (event) => {
    if (small.matches && event.target.closest("a")) apply();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && small.matches && !links.hidden) {
      apply();
      toggle.focus();
    }
  });
})();
