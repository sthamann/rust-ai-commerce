/** Contain a workspace render failure and let the user retry without losing the application shell. */
import { Component, type ReactNode } from "react";
type Props = {
  title: string;
  retryLabel: string;
  children: ReactNode;
  onRetry?: () => void;
};
export default class WorkspaceBoundary extends Component<
  Props,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="studio-empty" role="alert">
          <h2>{this.props.title}</h2>
          <button
            className="studio-secondary"
            onClick={() => {
              if (this.props.onRetry) this.props.onRetry();
              else this.setState({ failed: false });
            }}
          >
            {this.props.retryLabel}
          </button>
        </section>
      );
    return this.props.children;
  }
}
