export interface IBaseResponse<T> {
  data?: T;
  metaData?: Record<string, unknown>;
  message?: string;
}

export class BaseController<T = unknown> {
  protected response(params: IBaseResponse<T>): IBaseResponse<T> {
    return {
      data: params.data,
      metaData: params.metaData,
      message: params.message ?? 'Success',
    };
  }
}

export class GeneralController {
  protected response<D>(params: IBaseResponse<D>): IBaseResponse<D> {
    return {
      data: params.data,
      metaData: params.metaData,
      message: params.message ?? 'Success',
    };
  }
}
