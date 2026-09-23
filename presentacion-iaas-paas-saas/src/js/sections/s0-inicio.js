(function () {
  "use strict";

  function setLayerProgress(slide, stepIndex) {
    slide.dataset.towerProgress = String(Math.max(0, Math.min(9, stepIndex)));
    slide.style.setProperty("--tower-progress", String(stepIndex));
  }

  Deck.onSlide("s0-portada", {
    enter(slide) {
      slide.classList.add("s0-entered");
    },
    leave(slide) {
      slide.classList.remove("s0-entered");
    }
  });

  Deck.onSlide("s0-que-es", {
    enter(slide) {
      slide.classList.add("s0-flowing");
    },
    leave(slide) {
      slide.classList.remove("s0-flowing");
    }
  });

  Deck.onSlide("s0-antes", {
    enter(slide) {
      setLayerProgress(slide, Number(slide.dataset.stepCurrent) || 0);
    },
    step(slide, stepIndex) {
      setLayerProgress(slide, stepIndex);
    },
    leave(slide) {
      setLayerProgress(slide, 0);
    }
  });
})();
