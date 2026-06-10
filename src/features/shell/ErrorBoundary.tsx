"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Receives the error + a retry callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Recoverable error boundary for the app shell (F1-T11). Catches render errors
 * in the subtree and shows a friendly fallback with a "Try again" button that
 * resets component state.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production, pipe this to a logging service; for local-first MVP we just
    // surface it in the console so the developer can see what happened.
    console.error("[ErrorBoundary] Unhandled render error:", error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return <DefaultErrorFallback error={error} onReset={this.reset} />;
  }
}

function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  return (
    <main
      role="main"
      className="mx-auto flex w-full max-w-xl flex-1 items-center justify-center px-4 py-10"
    >
      <Card className="text-center">
        <h1 className="text-xl font-bold text-danger">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">{error.message}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={onReset}
        >
          Try again
        </Button>
      </Card>
    </main>
  );
}
