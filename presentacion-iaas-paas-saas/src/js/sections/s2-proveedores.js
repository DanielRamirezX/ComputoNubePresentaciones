(function () {
  "use strict";

  function animateShares(slide) {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const showAll = document.body.classList.contains("is-all");
    slide.querySelectorAll("[data-share]").forEach((bar) => {
      const value = Number(bar.dataset.share) || 0;
      bar.style.width = reduced || showAll ? `${value}%` : "0%";
      requestAnimationFrame(() => { bar.style.width = `${value}%`; });
    });
    slide.querySelectorAll("[data-counter-target]").forEach((counter) => {
      const target = Number(counter.dataset.counterTarget) || 0;
      if (reduced || showAll) {
        counter.textContent = String(target);
        return;
      }
      const started = performance.now();
      const duration = 900;
      const tick = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        counter.textContent = String(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function updateActiveRow(slide, stepIndex) {
    slide.querySelectorAll("tbody tr.step").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.step) === stepIndex);
    });
  }

  function registerTable(id) {
    Deck.onSlide(id, {
      enter(slide) { updateActiveRow(slide, Number(slide.dataset.stepCurrent) || 0); },
      step(slide, stepIndex) { updateActiveRow(slide, stepIndex); },
      leave(slide) { updateActiveRow(slide, 0); }
    });
  }

  Deck.onSlide("s2-tres-grandes", {
    enter(slide) { animateShares(slide); },
    leave(slide) {
      slide.querySelectorAll("[data-share]").forEach((bar) => { bar.style.width = "0%"; });
      slide.querySelectorAll("[data-counter-target]").forEach((counter) => { counter.textContent = "0"; });
    }
  });

  registerTable("s2-caracteristicas");
  registerTable("s2-diccionario");

  Deck.onSlide("s2-siete-pasos", {
    enter(slide) { slide.dataset.serverStep = slide.dataset.stepCurrent || "0"; },
    step(slide, stepIndex) { slide.dataset.serverStep = String(stepIndex); },
    leave(slide) { slide.dataset.serverStep = "0"; }
  });

  Deck.onSlide("s2-precios", {
    enter(slide) {
      const slider = slide.querySelector("#s2-hours");
      const output = slide.querySelector("#s2-cost");
      if (!slider || !output || slider.dataset.bound === "true") return;
      const update = () => {
        const hours = Number(slider.value) || 0;
        const currency = "US" + String.fromCharCode(36);
        output.textContent = currency + (hours * 0.02).toFixed(2);
        output.classList.remove("is-updated");
        void output.offsetWidth;
        output.classList.add("is-updated");
      };
      slider.addEventListener("input", update);
      slider.addEventListener("change", update);
      slider.dataset.bound = "true";
      update();
    }
  });
})();
