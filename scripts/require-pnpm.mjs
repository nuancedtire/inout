if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('This project uses pnpm only. Run pnpm install instead.')
  process.exit(1)
}
