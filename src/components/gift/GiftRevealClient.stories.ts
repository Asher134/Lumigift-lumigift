/**
 * Chromatic story for GiftRevealClient component.
 *
 * Provides locked and unlocked story variants so Chromatic captures
 * visual baselines for both states of the gift reveal experience.
 *
 * Usage: npx chromatic --project-token=<token>
 */

import type { Meta, StoryObj } from "@storybook/react";
import { GiftRevealClient } from "@/components/gift/GiftRevealClient";

const FUTURE_TIMESTAMP = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days from now
const PAST_TIMESTAMP = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour ago

const BASE_GIFT = {
  id: "story-gift-001",
  senderName: "Alex",
  recipientName: "Jamie",
  amountUsdc: 50,
  message: "Happy Birthday! 🎉 Hope this makes your day special.",
  mediaUrl: null,
};

const meta: Meta<typeof GiftRevealClient> = {
  title: "Gift/GiftRevealClient",
  component: GiftRevealClient,
  parameters: {
    // Chromatic: capture at both viewports
    chromatic: {
      viewports: [375, 1280],
    },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof GiftRevealClient>;

/** Gift is still locked — shows countdown / lock icon */
export const Locked: Story = {
  args: {
    gift: { ...BASE_GIFT, unlockTime: FUTURE_TIMESTAMP, status: "locked" },
  },
};

/** Gift is unlocked — shows reveal animation and gift content */
export const Unlocked: Story = {
  args: {
    gift: { ...BASE_GIFT, unlockTime: PAST_TIMESTAMP, status: "unlocked" },
  },
};

/** Unlocked with a media attachment */
export const UnlockedWithMedia: Story = {
  args: {
    gift: {
      ...BASE_GIFT,
      unlockTime: PAST_TIMESTAMP,
      status: "unlocked",
      mediaUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    },
  },
};

/** Gift already claimed */
export const Claimed: Story = {
  args: {
    gift: { ...BASE_GIFT, unlockTime: PAST_TIMESTAMP, status: "claimed" },
  },
};
