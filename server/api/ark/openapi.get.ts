import { defineEventHandler, getRequestURL } from 'h3'
import { arkOpenApiDocument } from '../../resources/openapi'

export default defineEventHandler(event => arkOpenApiDocument(getRequestURL(event).origin))
