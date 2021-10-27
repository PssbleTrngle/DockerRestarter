import Docker, { ContainerInfo } from 'dockerode'
import { Data } from '.'
import config from './config'
const docker = new Docker()

export async function findMatchingContainers({ push_data, repository }: Data) {
   const containers = await docker.listContainers()

   const image = `${repository.repo_name}:${push_data.tag}`
   const matching = containers.filter(({ Image }) => {
      if (Image === image) return true
      return push_data.tag === 'latest' && Image === repository.repo_name
   })

   return matching
}

export async function pullImage(image: string, tag?: string) {
   const pulled = await docker.pull(`${image}${tag ? `:${tag}` : ''}`, { authconfig: config.docker })
   return new Promise<void>((res, rej) => {
      docker.modem.followProgress(pulled, error => {
         if (error) rej(error)
         else res()
      })
   })
}

export async function restartContainer({ Id, Names, Ports, NetworkSettings }: ContainerInfo) {
   const name = Names[0]
   const container = docker.getContainer(Id)
   const { Config } = await container.inspect()
   await container.stop()
   await container.remove()
   console.log(`Stopped ${name}`)

   const PortBindings = Ports.reduce(
      (o, p) => ({
         ...o,
         [`${p.PrivatePort}/tcp`]: [
            {
               HostPort: `${p.PublicPort}`,
            },
         ],
      }),
      {}
   )

   const created = await docker.createContainer({
      name,
      ...Config,
      NetworkingConfig: {
         EndpointsConfig: NetworkSettings.Networks,
      },
      HostConfig: { PortBindings },
   })

   await created.start()

   console.log(`Recreated ${name} with image ${Config.Image}`)
}
