import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignora erros de ESLint no build para não bloquear a compilação
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
