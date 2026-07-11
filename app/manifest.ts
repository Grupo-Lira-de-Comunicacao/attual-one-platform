import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ATTUAL ONE Platform MVP",
    short_name: "ATTUAL ONE",
    description: "Plataforma inteligente para negócios locais.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F6F8",
    theme_color: "#0F4C5C",
    orientation: "portrait-primary",
  };
}
