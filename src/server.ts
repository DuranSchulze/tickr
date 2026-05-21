import './sentry.server.config'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

export default createStartHandler(defaultStreamHandler)
