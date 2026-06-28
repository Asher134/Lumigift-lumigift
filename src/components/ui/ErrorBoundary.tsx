"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./Button";
import styles from "./ErrorBoundary.module.css";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * A reusable Error Boundary component that catches JavaScript errors 
 * in its child component tree and displays a fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to the console or an error reporting service
    console.error(`[ErrorBoundary:${this.props.name || "Unknown"}] caught an error:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={styles.container} role="alert">
          <div className={styles.content}>
            <h3 className={styles.title}>Something went wrong</h3>
            <p className={styles.message}>
              An error occurred in this part of the application.
            </p>
            <Button variant="secondary" size="sm" onClick={this.handleReset}>
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
