import { Link } from './ResourceEndpoint';

export interface OperationsNotActive<> {
  self: Link;
}

export interface OperationsActive extends OperationsNotActive {
  update: Link;
  complete: Link;
  delete: Link;
}

export interface OperationsInitiate extends OperationsNotActive {
  initiate: Link;
}
