(function initTooltips(global) {
  const ATTR = "data-tooltip";
  const ACTIVE_CLASS = "tooltip-active";

  function createTooltipElement() {
    const tip = document.createElement("div");
    tip.className = "tooltip-bubble";
    tip.role = "status";
    tip.ariaLive = "polite";
    return tip;
  }

  const tooltip = createTooltipElement();
  tooltip.style.transform = "translate(-9999px, -9999px)";
  let currentAnchor = null;

  function hideTooltip() {
    tooltip.textContent = "";
    tooltip.remove();
    tooltip.classList.remove(ACTIVE_CLASS);
    tooltip.style.transform = "translate(-9999px, -9999px)";
    if (currentAnchor) {
      currentAnchor.classList.remove(ACTIVE_CLASS);
      currentAnchor.removeAttribute("aria-description");
      currentAnchor = null;
    }
  }

  function showTooltip(anchor) {
    const text = anchor.getAttribute(ATTR);
    if (!text) return;
    anchor.classList.add(ACTIVE_CLASS);
    anchor.setAttribute("aria-description", text);
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    const rect = anchor.getBoundingClientRect();
    const bubbleRect = tooltip.getBoundingClientRect();
    const top = rect.top + global.scrollY - bubbleRect.height - 8;
    const left = rect.left + global.scrollX + rect.width / 2 - bubbleRect.width / 2;

    tooltip.style.top = `${Math.max(top, 8)}px`;
    tooltip.style.left = `${Math.max(8, Math.min(left, global.innerWidth - bubbleRect.width - 8))}px`;
    tooltip.style.transform = "translate(0, 0)";
    tooltip.classList.add(ACTIVE_CLASS);
    currentAnchor = anchor;
  }

  document.addEventListener("mouseover", event => {
    const target = event.target.closest(`[${ATTR}]`);
    if (!target) {
      hideTooltip();
      return;
    }
    if (target === currentAnchor) return;
    hideTooltip();
    showTooltip(target);
  });

  document.addEventListener("focusin", event => {
    const target = event.target.closest(`[${ATTR}]`);
    if (!target) return;
    hideTooltip();
    showTooltip(target);
  });

  document.addEventListener("mouseleave", event => {
    if (event.target && event.target.contains(tooltip)) return;
    hideTooltip();
  });

  document.addEventListener("focusout", event => {
    if (event.target === currentAnchor) hideTooltip();
  });

  global.addEventListener("scroll", () => {
    if (!currentAnchor) return;
    hideTooltip();
  }, { passive: true });

  global.addEventListener("resize", () => {
    if (!currentAnchor) return;
    hideTooltip();
  });

})(typeof window !== "undefined" ? window : globalThis);
