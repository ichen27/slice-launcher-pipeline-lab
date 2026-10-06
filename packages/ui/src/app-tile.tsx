export interface AppTileProps {
  name: string;
  description: string;
  href: string | null;
}

export function AppTile({ name, description, href }: AppTileProps) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-[#e5e4df] bg-[#fffefb] p-6 text-[#292c30]">
      <span
        className="mb-6 flex size-11 items-center justify-center rounded-xl bg-[#fff0e3] text-lg font-medium text-[#a4461c]"
        aria-hidden="true"
      >
        {name.charAt(0)}
      </span>
      <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
      <p className="mt-2 mb-7 text-sm leading-6 text-[#666962]">{description}</p>
      {href ? (
        <a
          className="mt-auto inline-flex items-center justify-between gap-4 rounded-lg bg-[#30372e] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#465140] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a4461c]"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open app<span aria-hidden="true">↗</span>
          <span className="sr-only"> — {name} (opens in a new tab)</span>
        </a>
      ) : (
        <span className="mt-auto inline-flex self-start rounded-full border border-[#e1ddd2] bg-[#f8f6ef] px-3 py-1 text-xs font-medium text-[#656957]">
          Coming soon
        </span>
      )}
    </article>
  );
}
