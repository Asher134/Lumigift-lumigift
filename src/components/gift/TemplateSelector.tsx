"use client";

import Image from "next/image";
import { GIFT_TEMPLATES, BLANK_TEMPLATE, type GiftTemplate } from "@/lib/giftTemplates";
import styles from "./TemplateSelector.module.css";

interface TemplateSelectorProps {
  onSelect: (template: GiftTemplate) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  return (
    <div className={styles.wrapper}>
      <h2 className={styles.title}>Choose an Occasion</h2>
      <p className={styles.subtitle}>Pick a template to get started, or create a custom gift.</p>
      <div className={styles.grid}>
        {[...GIFT_TEMPLATES, BLANK_TEMPLATE].map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            className={styles.card}
            onClick={() => onSelect(tpl)}
          >
            {tpl.image ? (
              <Image
                src={tpl.image}
                alt={`${tpl.occasion} gift template preview`}
                width={80}
                height={80}
                loading="lazy"
                className={styles.previewImage}
              />
            ) : (
              <span className={styles.emoji} aria-hidden="true">{tpl.emoji}</span>
            )}
            <span className={styles.label}>{tpl.occasion}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
