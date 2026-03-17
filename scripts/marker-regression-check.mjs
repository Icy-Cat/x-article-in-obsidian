function deleteMarkerFromTextNode(text, marker) {
  const offset = text.indexOf(marker);
  if (offset === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }
  return text.slice(0, offset) + text.slice(offset + marker.length);
}

function removeResidualMarkers(text) {
  return text
    .replace(/(^|\s)(MPH_MARKER_\d+)(?=\s|$)/g, (_match, leadingWs) => leadingWs || "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
  }
}

const deleteCases = [
  {
    label: "numeric line before marker is preserved",
    input: "18\nMPH_MARKER_22",
    marker: "MPH_MARKER_22",
    expected: "18\n",
  },
  {
    label: "text before marker is preserved",
    input: "hello\nMPH_MARKER_3\nworld",
    marker: "MPH_MARKER_3",
    expected: "hello\n\nworld",
  },
  {
    label: "same-line prefix is preserved",
    input: "prefix MPH_MARKER_8 suffix",
    marker: "MPH_MARKER_8",
    expected: "prefix  suffix",
  },
];

for (const testCase of deleteCases) {
  assertEqual(
    deleteMarkerFromTextNode(testCase.input, testCase.marker),
    testCase.expected,
    testCase.label,
  );
}

const cleanupCases = [
  {
    label: "cleanup keeps numeric text before marker",
    input: "18\nMPH_MARKER_22",
    expected: "18\n",
  },
  {
    label: "cleanup keeps surrounding text",
    input: "alpha\nMPH_MARKER_5\nbeta",
    expected: "alpha\n\nbeta",
  },
  {
    label: "cleanup removes standalone inline marker only",
    input: "foo MPH_MARKER_7 bar",
    expected: "foo bar",
  },
];

for (const testCase of cleanupCases) {
  assertEqual(removeResidualMarkers(testCase.input), testCase.expected, testCase.label);
}

console.log("marker-regression-check: ok");
