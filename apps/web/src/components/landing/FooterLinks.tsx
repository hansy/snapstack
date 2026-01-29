import type { LucideIcon } from "lucide-react";
import { Github, Globe, MessageCircle } from "lucide-react";

type FooterLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

type FooterLinksProps = {
  links?: FooterLink[];
  brand?: string;
};

const defaultLinks: FooterLink[] = [
  {
    href: "https://drawspell.space",
    label: "Drawspell website",
    Icon: Globe,
  },
  {
    href: "https://github.com",
    label: "GitHub",
    Icon: Github,
  },
  {
    href: "https://discord.com",
    label: "Community chat",
    Icon: MessageCircle,
  },
];

export function FooterLinks({
  links = defaultLinks,
  brand = "Drawspell",
}: FooterLinksProps) {
  return (
    <footer className="flex items-center justify-between px-6 pb-6 text-xs text-zinc-400 sm:px-10">
      <span className="uppercase tracking-[0.3em]">{brand}</span>
      <div className="flex items-center gap-4">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="transition hover:text-zinc-100"
            aria-label={link.label}
          >
            <link.Icon className="h-4 w-4" />
          </a>
        ))}
      </div>
    </footer>
  );
}
