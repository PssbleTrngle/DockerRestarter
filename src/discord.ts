import axios from 'axios'
import config from './config'

const discord = axios.create({
   baseURL: config.discord_webhook,
   method: 'POST',
   headers: {
      'Content-Type': 'application/json',
   },
})

interface Embed {
   color?: number
   title?: string
   description?: string
}

export function sendEmbeds(embed: Embed | Embed[]) {
   const embeds = (Array.isArray(embed) ? embed : [embed]).map(e => ({
      ...e,
      author: {
         name: 'Docker',
         icon_url: 'https://www.docker.com/sites/default/files/d8/styles/role_icon/public/2019-07/vertical-logo-monochromatic.png?itok=erja9lKc',
      },
   }))
   return discord({ data: { embeds } })
}
