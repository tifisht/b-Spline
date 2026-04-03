const CURVE_WIDTH = 1000;
const CURVE_HEIGHT = 620;
const BASIS_WIDTH = 1000;
const BASIS_HEIGHT = 260;
const POINT_COLORS = [
  "#127c82",
  "#df6d43",
  "#d4a64f",
  "#7f6edb",
  "#1f5d91",
  "#4ea06a",
  "#a34a8d",
  "#bc5c2c",
  "#5c7d2b",
  "#4f8bd6",
];

const state = {
  points: createInitialPoints(),
  degree: 3,
  samples: 240,
  u: 0.5,
  draggingIndex: null,
  selectedIndex: 2,
  didDrag: false,
};

const elements = {
  curveSvg: document.getElementById("curveSvg"),
  basisSvg: document.getElementById("basisSvg"),
  gridLayer: document.getElementById("gridLayer"),
  controlPolygon: document.getElementById("controlPolygon"),
  curvePath: document.getElementById("curvePath"),
  controlPointsLayer: document.getElementById("controlPointsLayer"),
  currentPointLayer: document.getElementById("currentPointLayer"),
  basisGridLayer: document.getElementById("basisGridLayer"),
  basisPathsLayer: document.getElementById("basisPathsLayer"),
  basisMarkerLayer: document.getElementById("basisMarkerLayer"),
  addPointBtn: document.getElementById("addPointBtn"),
  removePointBtn: document.getElementById("removePointBtn"),
  resetBtn: document.getElementById("resetBtn"),
  degreeRange: document.getElementById("degreeRange"),
  degreeValue: document.getElementById("degreeValue"),
  sampleRange: document.getElementById("sampleRange"),
  sampleValue: document.getElementById("sampleValue"),
  uRange: document.getElementById("uRange"),
  uValue: document.getElementById("uValue"),
  pointCountStat: document.getElementById("pointCountStat"),
  spanStat: document.getElementById("spanStat"),
  currentPointStat: document.getElementById("currentPointStat"),
  knotCountStat: document.getElementById("knotCountStat"),
  basisTerms: document.getElementById("basisTerms"),
  knotVector: document.getElementById("knotVector"),
};

function createInitialPoints() {
  return [
    { x: 90, y: 500 },
    { x: 200, y: 190 },
    { x: 360, y: 110 },
    { x: 530, y: 440 },
    { x: 720, y: 280 },
    { x: 900, y: 120 },
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatNumber(value, digits = 3) {
  return Number(value).toFixed(digits);
}

function buildClampedUniformKnots(pointCount, degree) {
  const n = pointCount - 1;
  const knotCount = n + degree + 2;
  const knots = [];
  const interiorCount = n - degree;

  for (let i = 0; i < knotCount; i += 1) {
    if (i <= degree) {
      knots.push(0);
    } else if (i >= knotCount - degree - 1) {
      knots.push(1);
    } else {
      knots.push((i - degree) / (interiorCount + 1));
    }
  }

  return knots;
}

function findSpan(pointCount, degree, u, knots) {
  const n = pointCount - 1;

  if (u >= knots[n + 1]) {
    return n;
  }

  if (u <= knots[degree]) {
    return degree;
  }

  let low = degree;
  let high = n + 1;
  let mid = Math.floor((low + high) / 2);

  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) {
      high = mid;
    } else {
      low = mid;
    }
    mid = Math.floor((low + high) / 2);
  }

  return mid;
}

function basisFuns(span, u, degree, knots) {
  const left = new Array(degree + 1).fill(0);
  const right = new Array(degree + 1).fill(0);
  const basis = new Array(degree + 1).fill(0);
  basis[0] = 1;

  for (let j = 1; j <= degree; j += 1) {
    left[j] = u - knots[span + 1 - j];
    right[j] = knots[span + j] - u;
    let saved = 0;

    for (let r = 0; r < j; r += 1) {
      const denominator = right[r + 1] + left[j - r];
      const temp = denominator === 0 ? 0 : basis[r] / denominator;
      basis[r] = saved + right[r + 1] * temp;
      saved = left[j - r] * temp;
    }

    basis[j] = saved;
  }

  return basis;
}

function evaluateBasisValues(u, pointCount, degree, knots) {
  const safeU = u >= 1 ? 1 - 1e-9 : u;
  const span = findSpan(pointCount, degree, safeU, knots);
  const localBasis = basisFuns(span, safeU, degree, knots);
  const values = new Array(pointCount).fill(0);

  for (let j = 0; j <= degree; j += 1) {
    const index = span - degree + j;
    if (index >= 0 && index < pointCount) {
      values[index] = localBasis[j];
    }
  }

  if (u >= 1) {
    values.fill(0);
    values[pointCount - 1] = 1;
    return { values, span: pointCount - 1 };
  }

  return { values, span };
}

function evaluateCurvePoint(u, points, degree, knots) {
  const { values, span } = evaluateBasisValues(u, points.length, degree, knots);
  let x = 0;
  let y = 0;

  values.forEach((value, index) => {
    x += points[index].x * value;
    y += points[index].y * value;
  });

  return { x, y, weights: values, span };
}

function pathFromPoints(points) {
  if (!points.length) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function generateCurveSamples(points, degree, knots, sampleCount) {
  const samples = [];

  for (let i = 0; i <= sampleCount; i += 1) {
    const u = i / sampleCount;
    samples.push(evaluateCurvePoint(u, points, degree, knots));
  }

  return samples;
}

function getPointColor(index) {
  return POINT_COLORS[index % POINT_COLORS.length];
}

function describeSpan(span, knots, u) {
  if (span == null || span < 0 || span + 1 >= knots.length) {
    return "-";
  }

  if (u >= 1) {
    return `[${formatNumber(knots[span])}, ${formatNumber(knots[span + 1])}]`;
  }

  return `[${formatNumber(knots[span])}, ${formatNumber(knots[span + 1])})`;
}

function createGridMarkup(width, height, xStep, yStep, xLabelFormatter, yLabelFormatter) {
  let markup = "";

  for (let x = 0; x <= width; x += xStep) {
    const strong = x === 0 || x === width;
    markup += `<line class="grid-line ${strong ? "grid-line-strong" : ""}" x1="${x}" y1="0" x2="${x}" y2="${height}"></line>`;
    if (x < width) {
      markup += `<text class="axis-text" x="${x + 6}" y="${height - 8}">${xLabelFormatter(x)}</text>`;
    }
  }

  for (let y = 0; y <= height; y += yStep) {
    const strong = y === 0 || y === height;
    markup += `<line class="grid-line ${strong ? "grid-line-strong" : ""}" x1="0" y1="${y}" x2="${width}" y2="${y}"></line>`;
    if (y > 0 && y < height) {
      markup += `<text class="axis-text" x="10" y="${y - 8}">${yLabelFormatter(y)}</text>`;
    }
  }

  return markup;
}

function renderGrid() {
  elements.gridLayer.innerHTML = createGridMarkup(
    CURVE_WIDTH,
    CURVE_HEIGHT,
    100,
    100,
    (x) => `x=${x}`,
    (y) => `y=${CURVE_HEIGHT - y}`
  );

  elements.basisGridLayer.innerHTML = createGridMarkup(
    BASIS_WIDTH,
    BASIS_HEIGHT,
    250,
    52,
    (x) => `u=${formatNumber(x / BASIS_WIDTH, 2)}`,
    (y) => `${formatNumber((BASIS_HEIGHT - y) / BASIS_HEIGHT, 2)}`
  );
}

function renderControlPoints() {
  const markup = state.points
    .map((point, index) => {
      const color = getPointColor(index);
      const selectedClass = index === state.selectedIndex ? "selected" : "";
      return `
        <g class="control-point ${selectedClass}" data-point-index="${index}">
          <circle class="control-point-hit" data-point-index="${index}" cx="${point.x}" cy="${point.y}" r="20"></circle>
          <circle class="control-point-ring" cx="${point.x}" cy="${point.y}" r="12" fill="${color}"></circle>
          <circle class="control-point-core" cx="${point.x}" cy="${point.y}" r="7" fill="white"></circle>
          <text class="point-label" x="${point.x + 16}" y="${point.y - 16}">P${index}</text>
        </g>
      `;
    })
    .join("");

  elements.controlPointsLayer.innerHTML = markup;
}

function renderCurrentPoint(currentPoint) {
  const guideX = currentPoint.x;
  const guideY = currentPoint.y;

  elements.currentPointLayer.innerHTML = `
    <line class="current-guide" x1="${guideX}" y1="${guideY}" x2="${guideX}" y2="${CURVE_HEIGHT}"></line>
    <line class="current-guide" x1="0" y1="${guideY}" x2="${guideX}" y2="${guideY}"></line>
    <circle class="current-dot" cx="${guideX}" cy="${guideY}" r="10"></circle>
    <text class="curve-caption" x="${guideX + 16}" y="${guideY - 16}">
      C(${formatNumber(state.u, 3)})
    </text>
  `;
}

function renderBasisChart(points, degree, knots) {
  const pathSegments = points.map(() => []);
  const markers = [];

  for (let step = 0; step <= 240; step += 1) {
    const u = step / 240;
    const { values } = evaluateBasisValues(u, points.length, degree, knots);
    values.forEach((value, index) => {
      const x = u * BASIS_WIDTH;
      const y = BASIS_HEIGHT - value * BASIS_HEIGHT;
      pathSegments[index].push(`${step === 0 ? "M" : "L"} ${x} ${y}`);
    });
  }

  const current = evaluateBasisValues(state.u, points.length, degree, knots);
  const basisMarkup = pathSegments
    .map((segments, index) => {
      const x = state.u * BASIS_WIDTH;
      const y = BASIS_HEIGHT - current.values[index] * BASIS_HEIGHT;
      if (current.values[index] > 0.002) {
        markers.push(`
          <circle class="basis-marker" cx="${x}" cy="${y}" r="7" fill="${getPointColor(index)}"></circle>
          <text class="basis-label" x="${x + 10}" y="${clamp(y - 12, 18, BASIS_HEIGHT - 10)}">N${index},${degree}</text>
        `);
      }
      return `<path class="basis-path" stroke="${getPointColor(index)}" d="${segments.join(" ")}"></path>`;
    })
    .join("");

  elements.basisPathsLayer.innerHTML = basisMarkup;
  elements.basisMarkerLayer.innerHTML = `
    <line class="basis-line" x1="${state.u * BASIS_WIDTH}" y1="0" x2="${state.u * BASIS_WIDTH}" y2="${BASIS_HEIGHT}"></line>
    ${markers.join("")}
  `;
}

function renderDynamicPanels(currentPoint, knots) {
  elements.degreeValue.textContent = String(state.degree);
  elements.sampleValue.textContent = String(state.samples);
  elements.uValue.textContent = formatNumber(state.u, 3);
  elements.pointCountStat.textContent = String(state.points.length);
  elements.spanStat.textContent = describeSpan(currentPoint.span, knots, state.u);
  elements.currentPointStat.textContent = `(${formatNumber(currentPoint.x, 1)}, ${formatNumber(currentPoint.y, 1)})`;
  elements.knotCountStat.textContent = String(knots.length);

  elements.knotVector.innerHTML = knots
    .map((value, index) => `<span class="knot-chip">u${index} = ${formatNumber(value, 3)}</span>`)
    .join("");

  elements.basisTerms.innerHTML = currentPoint.weights
    .map((weight, index) => {
      return `
        <span class="term-chip">
          <span class="term-color" style="background:${getPointColor(index)}"></span>
          N<sub>${index},${state.degree}</sub> = ${formatNumber(weight, 3)}
        </span>
      `;
    })
    .join("");
}

function updateControlAvailability() {
  const minPoints = state.degree + 1;
  elements.removePointBtn.disabled = state.points.length <= minPoints;
  elements.degreeRange.max = String(Math.max(1, Math.min(5, state.points.length - 1)));
  if (state.degree > Number(elements.degreeRange.max)) {
    state.degree = Number(elements.degreeRange.max);
    elements.degreeRange.value = String(state.degree);
  }
}

function render() {
  updateControlAvailability();
  const knots = buildClampedUniformKnots(state.points.length, state.degree);
  const curveSamples = generateCurveSamples(state.points, state.degree, knots, state.samples);
  const currentPoint = evaluateCurvePoint(state.u, state.points, state.degree, knots);

  elements.controlPolygon.setAttribute("d", pathFromPoints(state.points));
  elements.curvePath.setAttribute(
    "d",
    curveSamples
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ")
  );

  renderControlPoints();
  renderCurrentPoint(currentPoint);
  renderBasisChart(state.points, state.degree, knots);
  renderDynamicPanels(currentPoint, knots);
}

function clientToSvg(event, svg) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
  return {
    x: clamp(transformed.x, 20, CURVE_WIDTH - 20),
    y: clamp(transformed.y, 20, CURVE_HEIGHT - 20),
  };
}

function addPointAt(x, y, insertIndex = state.points.length) {
  const point = { x: clamp(x, 40, CURVE_WIDTH - 40), y: clamp(y, 40, CURVE_HEIGHT - 40) };
  state.points.splice(insertIndex, 0, point);
  state.selectedIndex = insertIndex;
  render();
}

function addPointSmart() {
  if (state.points.length === 0) {
    addPointAt(CURVE_WIDTH / 2, CURVE_HEIGHT / 2, 0);
    return;
  }

  const currentIndex = state.selectedIndex ?? (state.points.length - 1);

  if (currentIndex < state.points.length - 1) {
    const start = state.points[currentIndex];
    const end = state.points[currentIndex + 1];
    addPointAt(lerp(start.x, end.x, 0.5), lerp(start.y, end.y, 0.5) - 35, currentIndex + 1);
    return;
  }

  if (state.points.length >= 2) {
    const last = state.points[state.points.length - 1];
    const prev = state.points[state.points.length - 2];
    addPointAt(last.x + (last.x - prev.x) * 0.45, last.y + (last.y - prev.y) * 0.45 + 26);
    return;
  }

  addPointAt(state.points[0].x + 120, state.points[0].y - 80);
}

function removePoint() {
  const minPoints = state.degree + 1;
  if (state.points.length <= minPoints) {
    return;
  }

  const index = state.selectedIndex ?? state.points.length - 1;
  state.points.splice(index, 1);
  state.selectedIndex = state.points.length ? clamp(index, 0, state.points.length - 1) : null;
  render();
}

function resetScene() {
  state.points = createInitialPoints();
  state.degree = 3;
  state.samples = 240;
  state.u = 0.5;
  state.selectedIndex = 2;
  elements.degreeRange.value = "3";
  elements.sampleRange.value = "240";
  elements.uRange.value = "0.5";
  render();
}

elements.addPointBtn.addEventListener("click", addPointSmart);
elements.removePointBtn.addEventListener("click", removePoint);
elements.resetBtn.addEventListener("click", resetScene);

elements.degreeRange.addEventListener("input", (event) => {
  state.degree = Number(event.target.value);
  render();
});

elements.sampleRange.addEventListener("input", (event) => {
  state.samples = Number(event.target.value);
  render();
});

elements.uRange.addEventListener("input", (event) => {
  state.u = Number(event.target.value);
  render();
});

elements.curveSvg.addEventListener("pointerdown", (event) => {
  const target = event.target.closest("[data-point-index]");
  if (!target) {
    return;
  }

  const index = Number(target.dataset.pointIndex);
  if (Number.isNaN(index)) {
    return;
  }

  state.draggingIndex = index;
  state.selectedIndex = index;
  state.didDrag = false;
  event.preventDefault();
  render();
});

window.addEventListener("pointermove", (event) => {
  if (state.draggingIndex == null) {
    return;
  }

  const coords = clientToSvg(event, elements.curveSvg);
  state.points[state.draggingIndex] = coords;
  state.didDrag = true;
  render();
});

window.addEventListener("pointerup", () => {
  state.draggingIndex = null;
});

elements.curveSvg.addEventListener("click", (event) => {
  if (state.didDrag) {
    state.didDrag = false;
    return;
  }

  const target = event.target.closest("[data-point-index]");
  if (!target) {
    state.selectedIndex = null;
    render();
  }
});

elements.curveSvg.addEventListener("dblclick", (event) => {
  const target = event.target.closest("[data-point-index]");
  if (target) {
    return;
  }

  const coords = clientToSvg(event, elements.curveSvg);
  addPointAt(coords.x, coords.y);
});

renderGrid();
render();
