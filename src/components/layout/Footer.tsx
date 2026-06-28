import Link from "next/link";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <nav className={styles.nav} aria-label="Footer navigation">
          <Link href="/help" className={styles.link}>Help & FAQ</Link>
          <Link href="/terms" className={styles.link}>Terms</Link>
          <Link href="/security" className={styles.link}>Security</Link>
        </nav>
        <p className={styles.copy}>© {new Date().getFullYear()} Lumigift</p>
      </div>
    </footer>
  );
}
