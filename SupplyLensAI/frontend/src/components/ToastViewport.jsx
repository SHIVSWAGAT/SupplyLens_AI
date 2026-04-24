export default function ToastViewport({ toasts }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article key={toast.id} className={`toast toast--${toast.variant || "info"}`}>
          <strong>{toast.title}</strong>
          <p>{toast.message}</p>
        </article>
      ))}
    </div>
  );
}
