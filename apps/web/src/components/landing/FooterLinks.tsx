import type { LucideIcon } from "lucide-react";
import { Github } from "lucide-react";

type FooterLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

type FooterLinksProps = {
  links?: FooterLink[];
};

const defaultLinks: FooterLink[] = [
  {
    href: "https://github.com/hansy/drawspell",
    label: "Drawspell on GitHub",
    Icon: Github,
  },
];

export function FooterLinks({
  links = defaultLinks,
}: FooterLinksProps) {
  return (
    <footer
      className="flex items-center justify-between px-6 pb-6 text-xs text-zinc-400 sm:px-10"
      style={{
        fontFamily:
          '"Space Mono", "IBM Plex Mono", "Menlo", "Monaco", "Consolas", "Liberation Mono", monospace',
      }}
    >
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="group inline-flex items-center transition hover:text-zinc-100"
            aria-label={link.label}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-zinc-400/40 transition group-hover:border-zinc-200">
              <link.Icon className="h-4 w-4" />
            </span>
          </a>
        ))}
      </div>
      <a
        href="https://scryfall.com"
        className="uppercase tracking-[0.3em] transition hover:text-zinc-100"
        style={{
          fontFamily:
            '"Source Serif Pro", "Iowan Old Style", "Palatino", "Georgia", serif',
        }}
      >
        Powered by Scryfall
      </a>
    </footer>
  );
}
