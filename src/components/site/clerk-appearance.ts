import type { ComponentProps } from "react";
import { dark } from "@clerk/themes";
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/** Clerk components styled with InAuto's dark tokens (light theme inherits via CSS variables). */
export const clerkAppearance: Appearance = {
  theme: dark,
  variables: {
    colorPrimary: "#4a8ddb",
    colorBackground: "#181b1e",
    colorForeground: "#eef0f1",
    colorMutedForeground: "#b3b8be",
    colorInput: "#111315",
    colorInputForeground: "#eef0f1",
    colorNeutral: "#eef0f1",
    borderRadius: "8px",
    fontFamily: 'var(--body), "Instrument Sans", system-ui, sans-serif',
    fontFamilyButtons: 'var(--body), "Instrument Sans", system-ui, sans-serif',
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid #23272b" },
    formButtonPrimary: { fontWeight: 600, textTransform: "none" },
  },
};
