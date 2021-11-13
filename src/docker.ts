import Docker, { ContainerInfo } from 'dockerode'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { Data } from '.'
import config from './config'
const docker = new Docker()

const hostnameFile = join('etc', 'hostname')
const hostname = existsSync(hostnameFile) ? readFileSync(hostnameFile).toString() : null

export async function findMatchingContainers({ push_data, repository }: Data) {
   const containers = await docker.listContainers()

   const image = `${repository.repo_name}:${push_data.tag}`

   const ignoredContainers = containers
      .filter(({ Labels, Id }) => {
         if (Labels['restarter.ignore']?.toLowerCase() === 'true') return true
         if (Id === hostname) return true
         return false
      })
      .map(c => c.Id)

   const matching = containers.filter(({ Image, Names, Id }) => {
      if (ignoredContainers.includes(Id)) {
         console.log(`Ignoring ${Names[0]}`)
         return false
      }

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
      HostConfig: { PortBindings },
   })

   await Promise.all(
      Object.entries(NetworkSettings.Networks).map(async ([key, network]) => {
         await docker.getNetwork(network.NetworkID).connect({ ...network, Container: created.id })
      })
   )

   await created.start()

   console.log(`Recreated ${name} with image ${Config.Image}`)
}
