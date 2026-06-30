import type { Meta, StoryObj } from "@storybook/react";
import { GiftListEmptyState } from "./GiftListEmptyState";

const meta: Meta<typeof GiftListEmptyState> = {
  title: "Gift/GiftListEmptyState",
  component: GiftListEmptyState,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Shown on the dashboard after loading completes when a user has no gifts. " +
          "Never rendered during the skeleton/loading phase.",
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof GiftListEmptyState>;

/** Default state — first-time user with no gifts. */
export const Default: Story = {};

/** Filtered empty state — user has gifts but the selected tab has none. */
export const FilteredEmpty: Story = {
  args: {
    heading: "No claimed gifts",
    description: "Gifts you have sent will appear here once they are claimed.",
  },
};

/** Expired filter empty state. */
export const ExpiredEmpty: Story = {
  args: {
    heading: "No expired gifts",
    description: "Gifts that have passed their unlock date without being claimed appear here.",
  },
};
