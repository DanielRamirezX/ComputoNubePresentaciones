(function () {
  "use strict";

  const models = [
    { key: "onprem", label: "On-premises", color: "var(--slate)", users: 9 },
    { key: "iaas", label: "IaaS", color: "var(--blue)", users: 5 },
    { key: "paas", label: "PaaS", color: "var(--green)", users: 2 },
    { key: "saas", label: "SaaS", color: "var(--coral)", users: 0 }
  ];

  function modelAt(index) {
    return models[Math.max(0, Math.min(models.length - 1, Number(index) || 0))];
  }

  function animateCount(countEl) {
    countEl.classList.remove("s1-count--changed");
    void countEl.offsetWidth;
    countEl.classList.add("s1-count--changed");
  }

  function setStackModel(slide, index, animate) {
    const model = typeof index === "string" ? models.find((item) => item.key === index) || models[0] : modelAt(index);
    const layers = Array.from(slide.querySelectorAll(".s1-stack__layer"));
    const tabs = Array.from(slide.querySelectorAll(".s1-stack__tab"));
    const countEl = slide.querySelector(".s1-stack__count");
    const countModel = slide.querySelector(".s1-stack__count-model");
    const layersWrap = slide.querySelector(".s1-stack__layers");

    slide.dataset.model = model.key;
    slide.style.setProperty("--s1-model-color", model.color);
    tabs.forEach((tab) => {
      const selected = tab.dataset.model === model.key;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    layers.forEach((layer, layerIndex) => {
      const provider = layerIndex + 1 > model.users;
      layer.classList.toggle("is-provider", provider);
      layer.classList.toggle("is-user", !provider);
      if (animate) {
        layer.classList.remove("s1-layer--cascade");
        layer.style.animationDelay = `${(layers.length - layerIndex - 1) * 48}ms`;
        void layer.offsetWidth;
        layer.classList.add("s1-layer--cascade");
      }
    });

    if (layersWrap) {
      const firstLayer = layers[0];
      const gap = Number.parseFloat(getComputedStyle(layersWrap).rowGap || "3") || 3;
      const layerHeight = firstLayer?.offsetHeight || 34;
      // Keep the responsibility divider in the gap between layers. SaaS owns
      // none of them, so its divider sits just above layer 1; On-premises owns
      // all of them, so its divider sits just below layer 9.
      const dividerY = model.users === 0
        ? -14
        : model.users * (layerHeight + gap) - gap + 5;
      layersWrap.style.setProperty("--s1-divider-y", `${dividerY}px`);
    }
    if (countEl) {
      countEl.innerHTML = `Tú administras <b>${model.users} de 9</b> capas`;
      if (animate) animateCount(countEl);
    }
    if (countModel) countModel.textContent = model.label;
  }

  function bindStack(slide) {
    if (slide.dataset.s1Bound === "true") return;
    slide.dataset.s1Bound = "true";
    slide.querySelectorAll(".s1-stack__tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const index = models.findIndex((model) => model.key === tab.dataset.model);
        slide.dataset.stepCurrent = String(Math.max(0, index));
        setStackModel(slide, index, true);
      });
    });
  }

  Deck.onSlide("s1-stack", {
    enter(slide) {
      bindStack(slide);
      setStackModel(slide, Number(slide.dataset.stepCurrent) || 0, false);
    },
    step(slide, stepIndex) {
      setStackModel(slide, stepIndex, true);
    },
    leave(slide) {
      slide.querySelectorAll(".s1-stack__layer").forEach((layer) => {
        layer.classList.remove("s1-layer--cascade");
        layer.style.animationDelay = "";
      });
    }
  });

  function updateQuizCount(slide) {
    const cards = Array.from(slide.querySelectorAll(".s1-quiz-card"));
    const count = cards.filter((card) => card.classList.contains("is-flipped")).length;
    const counter = slide.querySelector("[data-quiz-count]");
    if (counter) counter.textContent = `Respuestas descubiertas: ${count} / ${cards.length}`;
  }

  function bindQuiz(slide) {
    if (slide.dataset.s1Bound === "true") return;
    slide.dataset.s1Bound = "true";
    slide.querySelectorAll(".s1-quiz-card").forEach((card) => {
      card.addEventListener("click", () => {
        Deck.flip(card);
        updateQuizCount(slide);
      });
    });
  }

  function revealQuizCard(card, visible) {
    if (card) card.classList.toggle("s1-card-hidden", !visible);
  }

  Deck.onSlide("s1-quiz", {
    enter(slide) {
      bindQuiz(slide);
      const cards = Array.from(slide.querySelectorAll(".s1-quiz-card"));
      const captureAll = document.body.classList.contains("is-all");
      const current = Number(slide.dataset.stepCurrent) || 0;
      cards.forEach((card, index) => {
        revealQuizCard(card, captureAll || index < current);
        Deck.flip(card, captureAll);
      });
      updateQuizCount(slide);
      requestAnimationFrame(() => { slide.scrollTop = 0; });
    },
    step(slide, stepIndex, direction) {
      const cards = Array.from(slide.querySelectorAll(".s1-quiz-card"));
      const cardIndex = direction > 0 ? stepIndex - 1 : stepIndex;
      if (cards[cardIndex]) {
        revealQuizCard(cards[cardIndex], direction > 0);
        Deck.flip(cards[cardIndex], direction > 0);
      }
      updateQuizCount(slide);
    }
  });

  function setServiceTip(group, chip) {
    const slide = group.closest(".s1-examples-saas");
    const tip = slide?.querySelector("[data-service-tip]");
    if (!tip) return;
    slide.querySelectorAll(".s1-service-chip").forEach((item) => item.classList.toggle("is-selected", item === chip));
    tip.textContent = chip.dataset.tip || "Servicio disponible desde internet.";
  }

  Deck.onSlide("s1-ejemplos-saas", {
    enter(slide) {
      if (slide.dataset.s1Bound === "true") return;
      slide.dataset.s1Bound = "true";
      slide.querySelectorAll(".s1-service-chip").forEach((chip) => {
        const group = chip.closest(".s1-saas-group");
        chip.addEventListener("mouseenter", () => setServiceTip(group, chip));
        chip.addEventListener("focus", () => setServiceTip(group, chip));
        chip.addEventListener("click", () => setServiceTip(group, chip));
      });
    }
  });
})();
