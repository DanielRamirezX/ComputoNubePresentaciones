(function () {
  "use strict";

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function clamp(value, total) {
    return Math.max(1, Math.min(total, Number(value) || 1));
  }

  function setCounter(slide, value) {
    qsa("[data-s4-counter]", slide).forEach((node) => { node.textContent = String(value); });
  }

  /* Boceto de ventana paso a paso (diapositivas 21, 22 y 24). */
  function bindWindow(id, total) {
    function render(slide, index) {
      const current = clamp(index, total);
      qsa("[data-s4-state]", slide).forEach((state) => {
        state.classList.toggle("is-current", Number(state.dataset.s4State) === current);
      });
      qsa("[data-s4-group]", slide).forEach((group) => {
        group.classList.toggle("is-live", Number(group.dataset.s4Group) === current);
      });
      setCounter(slide, current);
    }

    Deck.onSlide(id, {
      enter(slide) { render(slide, Number(slide.dataset.stepCurrent) || 1); },
      step(slide, index) { render(slide, index || 1); },
      leave(slide) { render(slide, 1); }
    });
  }

  /* Formulario de VirtualBox que se va llenando (diapositiva 23). */
  function bindForm(id, total) {
    function render(slide, index) {
      const current = clamp(index, total);
      const filled = Number(slide.dataset.stepCurrent) || 0;
      qsa("[data-s4-row]", slide).forEach((row) => {
        const position = Number(row.dataset.s4Row);
        row.classList.toggle("is-filled", position <= Math.max(filled, 0));
        row.classList.toggle("is-current", position === current && filled > 0);
      });
      setCounter(slide, current);
    }

    Deck.onSlide(id, {
      enter(slide) { render(slide, Number(slide.dataset.stepCurrent) || 1); },
      step(slide, index) { render(slide, index || 1); },
      leave(slide) { render(slide, 1); }
    });
  }

  bindWindow("s4-paso1", 5);
  bindWindow("s4-paso2", 3);
  bindForm("s4-paso3", 7);
  bindWindow("s4-paso4", 7);
})();
