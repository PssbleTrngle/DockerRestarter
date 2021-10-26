import dotenv from 'dotenv'

dotenv.config()

const port = Number.parseInt(process.env.PORT ?? '80')
const discord_webhook = process.env.DISCORD_WEBHOOK

const username = process.env.DOCKER_USERNAME
const password = process.env.DOCKER_PASSWORD

export default {
   port,
   discord_webhook,
   docker: {
      username,
      password,
   },
}
