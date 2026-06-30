import type { Meta, StoryObj } from "@storybook/react";
import { ThemeToggle } from "./ThemeToggle";

const meta: Meta<typeof ThemeToggle> = {
  title: "UI/ThemeToggle",
  component: ThemeToggle,
  parameters: {
    layout: "centered",
    // Chromatic captures a snapshot per story — keep both light and dark.
    chromatic: { disableSnapshot: false },
  },
};
export default meta;

type Story = StoryObj<typeof ThemeToggle>;

/** Rendered on a dark background — the toggle should show the sun (☀️) icon. */
export const DarkMode: Story = {
  decorators: [
    (Story) => {
      document.documentElement.setAttribute("data-theme", "dark");
      return (
        <div
          style={{
            padding: "2rem",
            background: "var(--color-bg)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

/** Rendered on a light background — the toggle should show the moon (🌙) icon. */
export const LightMode: Story = {
  decorators: [
    (Story) => {
      document.documentElement.setAttribute("data-theme", "light");
      return (
        <div
          style={{
            padding: "2rem",
            background: "var(--color-bg)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};
