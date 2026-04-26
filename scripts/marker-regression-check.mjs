function deleteMarkerFromTextNode(text, marker) {
  const offset = findExactTokenOffset(text, marker);
  if (offset === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }
  return text.slice(0, offset) + text.slice(offset + marker.length);
}

function isTokenBoundaryChar(char) {
  return !char || !/[A-Za-z0-9_]/.test(char);
}

function findExactTokenOffset(text, token) {
  if (!text || !token) {
    return -1;
  }

  let searchFrom = 0;
  while (searchFrom < text.length) {
    const offset = text.indexOf(token, searchFrom);
    if (offset === -1) {
      return -1;
    }

    const before = offset > 0 ? text[offset - 1] : "";
    const afterIndex = offset + token.length;
    const after = afterIndex < text.length ? text[afterIndex] : "";
    if (isTokenBoundaryChar(before) && isTokenBoundaryChar(after)) {
      return offset;
    }

    searchFrom = offset + token.length;
  }

  return -1;
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
  {
    label: "numeric text 42 before marker is preserved",
    input: "42\nMPH_MARKER_6",
    marker: "MPH_MARKER_6",
    expected: "42\n",
  },
  {
    label: "full sentence before marker is preserved",
    input: "Another paragraph with spaces.\nMPH_MARKER_12",
    marker: "MPH_MARKER_12",
    expected: "Another paragraph with spaces.\n",
  },
  {
    label: "numeric text 88 before marker is preserved",
    input: "88\nMPH_MARKER_13",
    marker: "MPH_MARKER_13",
    expected: "88\n",
  },
  {
    label: "random text block before marker is preserved",
    input: "Random text block C.\nMPH_MARKER_14",
    marker: "MPH_MARKER_14",
    expected: "Random text block C.\n",
  },
  {
    label: "marker 2 does not match marker 20",
    input: "before\nMPH_MARKER_20\nafter",
    marker: "MPH_MARKER_2",
    expectedError: true,
  },
  {
    label: "marker 20 still matches exactly",
    input: "before\nMPH_MARKER_20\nafter",
    marker: "MPH_MARKER_20",
    expected: "before\n\nafter",
  },
];

for (const testCase of deleteCases) {
  if (testCase.expectedError) {
    let threw = false;
    try {
      deleteMarkerFromTextNode(testCase.input, testCase.marker);
    } catch {
      threw = true;
    }
    assertEqual(threw, true, testCase.label);
  } else {
    assertEqual(
      deleteMarkerFromTextNode(testCase.input, testCase.marker),
      testCase.expected,
      testCase.label,
    );
  }
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
  {
    label: "cleanup keeps full sentence before marker from sample",
    input: "Another paragraph with spaces.\nMPH_MARKER_12",
    expected: "Another paragraph with spaces.\n",
  },
  {
    label: "cleanup keeps random text block before marker from sample",
    input: "Random text block C.\nMPH_MARKER_14",
    expected: "Random text block C.\n",
  },
];

for (const testCase of cleanupCases) {
  assertEqual(removeResidualMarkers(testCase.input), testCase.expected, testCase.label);
}

console.log("marker-regression-check: ok");
