import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2">
        <span className="text-2xl font-bold text-zinc-600">?</span>
      </div>
      <h1 className="text-xl font-semibold text-white">Page not found</h1>
      <p className="text-zinc-500 text-sm max-w-xs">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
