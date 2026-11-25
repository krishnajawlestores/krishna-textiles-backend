import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Applied only to the reviewed administrative/catalogue controllers. Never expose
// Prisma exception messages: they can contain request values and database details.
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PersistenceExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    let status = 500;
    let message = 'Unable to complete the request.';
    if (exception instanceof Prisma.PrismaClientValidationError ||
        ('code' in exception && ['P2000', 'P2005', 'P2006', 'P2007', 'P2011', 'P2012', 'P2013'].includes(exception.code))) {
      status = 400;
      message = 'Invalid request data.';
    } else if ('code' in exception && ['P2002', 'P2003', 'P2014', 'P2034'].includes(exception.code)) {
      status = 409;
      message = 'The request conflicts with existing data or a concurrent change.';
    } else if ('code' in exception && exception.code === 'P2025') {
      status = 404;
      message = 'Resource not found.';
    }
    host.switchToHttp().getResponse().status(status).json({
      statusCode: status,
      message,
      error: ({ 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict', 500: 'Internal Server Error' })[status],
    });
  }
}
