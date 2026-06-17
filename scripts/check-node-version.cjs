const [major] = process.versions.node.split('.').map(Number)
const minMajor = Number(process.env.SIBYLLA_MIN_NODE_MAJOR ?? 18)
const maxMajorExclusive = Number(process.env.SIBYLLA_MAX_NODE_MAJOR_EXCLUSIVE ?? 25)

if (major < minMajor || major >= maxMajorExclusive) {
  console.error(
    `Sibylla requires Node >=${minMajor} <${maxMajorExclusive}; current Node is ${process.version}.`,
  )
  console.error('Use the repository .nvmrc/.node-version before running dev, build, or tests.')
  process.exit(1)
}
