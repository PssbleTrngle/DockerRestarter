import { AxiosError } from 'axios'
import bodyparser from 'body-parser'
import { celebrate, isCelebrateError, Joi } from 'celebrate'
import express, { NextFunction, Request, Response } from 'express'
import config from './config'
import { sendEmbeds } from './discord'
import { findMatchingContainers, pullImage, restartContainer } from './docker'

const app = express()
app.use(bodyparser.json())
app.use(bodyparser.urlencoded({ extended: true }))

export interface Data {
   push_data: {
      pushed_at: number
      tag: string
      pusher: string
   }
   repository: {
      repo_url: string
      owner: string
      is_private: boolean
      repo_name: string
   }
}

app.post(
   '/',
   celebrate(
      {
         body: {
            push_data: Joi.object({
               pushed_at: Joi.number().required(),
               tag: Joi.string().required(),
               pusher: Joi.string().required(),
            }),
            repository: Joi.object({
               repo_url: Joi.string().required(),
               owner: Joi.string().required(),
               is_private: Joi.boolean().required(),
               repo_name: Joi.string().required(),
            }),
         },
      },
      { stripUnknown: true }
   ),
   async (req, res, next) => {
      try {
         const data = req.body as Data

         const matching = await findMatchingContainers(data)

         if (matching.length > 0) {
            await pullImage(data.repository.repo_name, data.push_data.tag)

            console.group('Restarting containers')
            await Promise.all(matching.map(restartContainer))

            console.groupEnd()
            console.log(`Recreated ${matching.length} containers`)

            if (config.discord_webhook) {
               await sendEmbeds(
                  matching.map(container => ({
                     color: 0x1cc93c,
                     title: `Updated ${container.Names[0]}`,
                     description: `
                     Container was recreated using image **${container.Image}**
                     Pushed by ${data.push_data.pusher} at ${new Date(data.push_data.pushed_at * 1000).toLocaleString('en-GB')}
                  `,
                  }))
               )
            }
         }

         res.status(200).json({
            success: true,
            containers: matching.length,
         })
      } catch (e) {
         next(e)
      }
   }
)

function isAxiosError(err: Error): err is AxiosError {
   if ((err as AxiosError).isAxiosError) return true
   return false
}

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
   if (isCelebrateError(err)) {
      const validation: Record<string, { source: string; keys: string[]; message: string }> = {}

      err.details.forEach(({ details }, source) => {
         validation[source] = { source, keys: details.map(d => d.path.join('.')), message: err.message }
      })

      res.status(400).json({
         message: 'Bad Input',
         validation,
      })
   } else {
      next(err)
   }
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
   if (isAxiosError(err)) {
      console.log(`Request to ${err.config?.url} failed with:`)
      console.log(err.response?.data)
   }

   if (config.discord_webhook) {
      sendEmbeds({
         color: 0xc92d1c,
         title: `Error occured: *${err.message}*`,
         description: '```javascript\n' + err.stack + '\n```',
      })
   }

   console.error(err.message)
   if (process.env.NODE_ENV !== 'production') console.error(err.stack)

   res.status(500).json({
      error: {
         message: err.message,
      },
   })
})

async function run() {
   app.listen(config.port)
   console.log(`Listing on port ${config.port}`)
}

run().catch(console.error)
