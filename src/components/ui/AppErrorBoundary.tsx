import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React render failed', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="min-h-screen bg-[#090a0d] px-5 py-10 text-white">
        <div className="mx-auto max-w-[430px] rounded-[28px] border border-white/10 bg-white/[0.05] p-5">
          <div className="text-lg font-semibold">Не удалось открыть экран</div>
          <p className="mt-2 text-sm leading-5 text-white/55">Закрой приложение и открой его ещё раз.</p>
        </div>
      </main>
    );
  }
}
