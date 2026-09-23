(function () {
  "use strict";

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function setBrowserStep(slide, stepIndex) {
    const current = Math.max(1, Math.min(6, Number(stepIndex) || 1));
    qsa("[data-browser-state]", slide).forEach((state) => {
      state.classList.toggle("is-current", Number(state.dataset.browserState) === current);
    });
    const counter = slide.querySelector("[data-browser-step]");
    if (counter) counter.textContent = String(current);
  }

  Deck.onSlide("s3-registro", {
    enter(slide) {
      setBrowserStep(slide, Number(slide.dataset.stepCurrent) || 1);
    },
    step(slide, stepIndex) {
      setBrowserStep(slide, stepIndex || 1);
    },
    leave(slide) {
      setBrowserStep(slide, 1);
    }
  });

  function setGlossaryCards(slide, flipped) {
    qsa(".s3-glossary-card", slide).forEach((card) => Deck.flip(card, flipped));
  }

  Deck.onSlide("s3-glosario", {
    enter(slide) {
      setGlossaryCards(slide, Number(slide.dataset.stepCurrent) > 0);
    },
    step(slide, stepIndex) {
      setGlossaryCards(slide, stepIndex > 0);
    },
    leave(slide) {
      setGlossaryCards(slide, false);
    }
  });

  qsa(".s3-glossary-card").forEach((card) => {
    card.addEventListener("click", () => Deck.flip(card));
  });

})();
