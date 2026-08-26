export class ValidationError extends Error {}

export class OwnershipError extends Error {
  constructor(message = "권한이 없어요.") {
    super(message);
  }
}

export class NotFoundError extends Error {}
