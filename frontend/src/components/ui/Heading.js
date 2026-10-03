import React from "react";
import AppText from "./AppText";

// Page and section headings. Also tells screen readers this text is a heading.
const LEVEL_VARIANT = {
  1: "pageTitle",
  2: "sectionTitle",
};

export default function Heading({ level = 2, ...props }) {
  return (
    <AppText
      variant={LEVEL_VARIANT[level] ?? "sectionTitle"}
      accessibilityRole="header"
      {...props}
    />
  );
}
