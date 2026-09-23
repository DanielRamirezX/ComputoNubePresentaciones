(function () {
  "use strict";

  const hooks = new Map();
  const state = {
    slides: [],
    index: 0,
    initialized: false,
    all: new URLSearchParams(window.location.search).get("all") === "1",
    touchX: null,
    touchY: null
  };

  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  function getGroups(slide) {
    const steps = qsa(".step", slide);
    const groups = [];
    const byKey = new Map();
    steps.forEach((step, position) => {
      const key = step.dataset.step || `__dom-${position}`;
      if (!byKey.has(key)) {
        const group = { key, elements: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      byKey.get(key).elements.push(step);
    });
    return groups;
  }

  function getHook(slide) { return hooks.get(slide.id) || {}; }

  function callHook(slide, name, ...args) {
    const callback = getHook(slide)[name];
    if (typeof callback !== "function") return;
    try { callback(slide, ...args); }
    catch (error) { console.error(`Error en Deck.onSlide(${slide.id}).${name}:`, error); }
  }

  function applyStepState(slide, current) {
    const groups = slide._stepGroups || [];
    const safeCurrent = Math.max(0, Math.min(current, groups.length));
    groups.forEach((group, index) => group.elements.forEach((element) => {
      element.classList.toggle("is-shown", state.all || index < safeCurrent);
    }));
    slide.dataset.stepCurrent = String(state.all ? groups.length : safeCurrent);
    return safeCurrent;
  }

  function setAnimationState(slide) {
    slide.classList.remove("is-active");
    void slide.offsetWidth;
    slide.classList.add("is-active");
  }

  function updateUrl() {
    const hash = `#/${state.index + 1}`;
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }

  function updateUi() {
    const slide = state.slides[state.index];
    if (!slide) return;
    const total = state.slides.length;
    const section = qs("[data-current-section]");
    const title = qs("[data-current-title]");
    const counter = qs("[data-counter]");
    const progress = qs("#deck-progress-bar");
    if (section) section.textContent = slide.dataset.section || "";
    if (title) title.textContent = slide.dataset.title || "";
    if (counter) counter.textContent = `${state.index + 1} / ${total}`;
    if (progress) progress.style.width = `${total ? ((state.index + 1) / total) * 100 : 0}%`;
    const previous = qs('[data-nav="prev"]');
    const next = qs('[data-nav="next"]');
    if (previous) previous.disabled = state.index === 0 && !(slide._stepGroups?.length && Number(slide.dataset.stepCurrent) > 0);
    if (next) next.disabled = false;
    updateIndexCurrent();
    updateNotes();
  }

  function updateNotes() {
    const body = qs("[data-notes-body]");
    const slide = state.slides[state.index];
    const notes = slide && qs(".notes", slide);
    if (body) body.innerHTML = notes ? `<div class="notes-copy">${notes.innerHTML}</div>` : "<p class=\"notes-copy\">Esta diapositiva no tiene notas.</p>";
  }

  function updateIndexCurrent() {
    qsa(".index-item").forEach((button) => button.classList.toggle("is-current", Number(button.dataset.index) === state.index));
  }

  function showOverlay(id) {
    qsa(".overlay-panel").forEach((panel) => {
      const open = panel.id === id;
      panel.classList.toggle("is-open", open);
      panel.setAttribute("aria-hidden", String(!open));
    });
    const scrim = qs(".overlay-scrim");
    if (scrim) scrim.hidden = !id;
  }

  function toggleOverlay(id) {
    const panel = qs(`#${id}`);
    if (panel?.classList.contains("is-open")) showOverlay(null);
    else showOverlay(id);
  }

  function buildIndex() {
    const body = qs("[data-index-body]");
    if (!body) return;
    body.innerHTML = "";
    const groups = new Map();
    state.slides.forEach((slide, index) => {
      const section = slide.dataset.section || "Sin sección";
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push({ slide, index });
    });
    groups.forEach((items, name) => {
      const group = document.createElement("section");
      group.className = "index-group";
      const heading = document.createElement("h3");
      heading.textContent = name;
      group.append(heading);
      items.forEach(({ slide, index }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "index-item";
        button.dataset.index = String(index);
        button.innerHTML = `<span class="index-item__number">${index + 1}</span><span>${slide.dataset.title || slide.id}</span>`;
        button.addEventListener("click", () => { goTo(index); showOverlay(null); });
        group.append(button);
      });
      body.append(group);
    });
  }

  function applyConfig() {
    const config = window.CLASE || {};
    qsa("[data-config]").forEach((element) => {
      const key = element.dataset.config;
      if (Object.prototype.hasOwnProperty.call(config, key)) element.textContent = config[key];
    });
  }

  function goTo(target, options = {}) {
    if (!state.slides.length) return;
    const index = Math.max(0, Math.min(Number(target) || 0, state.slides.length - 1));
    const previous = state.slides[state.index];
    const next = state.slides[index];
    if (previous && previous !== next) {
      callHook(previous, "leave");
      previous.classList.remove("is-active");
    }
    state.index = index;
    state.slides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === index));
    const current = options.showAll ? (next._stepGroups?.length || 0) : 0;
    applyStepState(next, current);
    setAnimationState(next);
    next.scrollTop = 0;
    callHook(next, "enter");
    updateUi();
    updateUrl();
    document.dispatchEvent(new CustomEvent("deck:change", { detail: { index, id: next.id, slide: next } }));
  }

  function changeStep(direction) {
    const slide = state.slides[state.index];
    if (!slide) return;
    const groups = slide._stepGroups || [];
    const current = Number(slide.dataset.stepCurrent) || 0;
    if (direction > 0) {
      if (current < groups.length) {
        const nextCurrent = applyStepState(slide, current + 1);
        callHook(slide, "step", nextCurrent, direction);
        updateUi();
        return;
      }
      if (state.index < state.slides.length - 1) goTo(state.index + 1);
      return;
    }
    if (current > 0) {
      const nextCurrent = applyStepState(slide, current - 1);
      callHook(slide, "step", nextCurrent, direction);
      updateUi();
      return;
    }
    if (state.index > 0) goTo(state.index - 1, { showAll: true });
  }

  function next() { changeStep(1); }
  function previous() { changeStep(-1); }

  function isTypingTarget(event) {
    const target = event.target;
    return target instanceof HTMLElement && (target.matches("input, select, textarea, [contenteditable=\"true\"]") || target.closest("[data-no-nav]"));
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function onKeyDown(event) {
    if (isTypingTarget(event)) return;
    if ((event.key === " " || event.key === "Enter") && event.target instanceof HTMLElement && event.target.matches("button, a")) return;
    const key = event.key;
    if (["ArrowRight", " ", "PageDown", "Enter"].includes(key)) { event.preventDefault(); next(); return; }
    if (["ArrowLeft", "PageUp", "Backspace"].includes(key)) { event.preventDefault(); previous(); return; }
    if (key === "Home") { event.preventDefault(); goTo(0); return; }
    if (key === "End") { event.preventDefault(); goTo(state.slides.length - 1, { showAll: state.all }); return; }
    if (key.toLowerCase() === "f") { event.preventDefault(); toggleFullscreen(); return; }
    if (key.toLowerCase() === "n") { event.preventDefault(); toggleOverlay("notes-panel"); return; }
    if (key.toLowerCase() === "o" || key === "Escape") { event.preventDefault(); toggleOverlay("slide-index"); return; }
    if (key === "?") { event.preventDefault(); toggleOverlay("help-panel"); }
  }

  function bindTouch() {
    document.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      state.touchX = touch.clientX;
      state.touchY = touch.clientY;
    }, { passive: true });
    document.addEventListener("touchend", (event) => {
      if (state.touchX === null) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - state.touchX;
      const dy = touch.clientY - state.touchY;
      state.touchX = null;
      state.touchY = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      if (dx < 0) next(); else previous();
    }, { passive: true });
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.slides = qsa(".slide");
    state.slides.forEach((slide) => { slide._stepGroups = getGroups(slide); });
    if (state.all) document.body.classList.add("is-all");
    applyConfig();
    buildIndex();
    qsa("[data-nav=\"next\"]").forEach((button) => button.addEventListener("click", next));
    qsa("[data-nav=\"prev\"]").forEach((button) => button.addEventListener("click", previous));
    qsa("[data-close-overlay]").forEach((button) => button.addEventListener("click", () => {
      const target = button.dataset.closeOverlay;
      if (target === "all") showOverlay(null); else showOverlay(target);
    }));
    document.addEventListener("keydown", onKeyDown);
    bindTouch();
    window.addEventListener("hashchange", () => {
      const match = window.location.hash.match(/^#\/(\d+)$/);
      if (match) goTo(Number(match[1]) - 1, { showAll: state.all });
    });
    const fromHash = window.location.hash.match(/^#\/(\d+)$/);
    goTo(fromHash ? Number(fromHash[1]) - 1 : 0, { showAll: state.all });
  }

  window.Deck = {
    onSlide(id, handlers) { hooks.set(id, handlers || {}); },
    goTo,
    next,
    previous,
    flip(element, flipped) {
      const card = typeof element === "string" ? qs(element) : element;
      if (!card) return;
      card.classList.toggle("is-flipped", flipped === undefined ? !card.classList.contains("is-flipped") : Boolean(flipped));
      card.setAttribute("aria-pressed", String(card.classList.contains("is-flipped")));
    }
  };

  function start() { init(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
