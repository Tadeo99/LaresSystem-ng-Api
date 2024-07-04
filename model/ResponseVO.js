class ResponseVO {
    constructor() {
        this.listaResultado = null;
        this.objetoResultado = null;
        this.codigoError = null;
        this.mensajeError = null;
        this.isError = false;
        this.contador = 0;
        this.accessToken = null;
        this.pagination = null;
    }

    static successLogin(listaResultado, objetoResultado, pagination,accessToken) {
        const response = new ResponseVO();
        response.listaResultado = listaResultado;
        response.objetoResultado = objetoResultado;
        response.contador = listaResultado ? listaResultado.length : 0;
        response.pagination = pagination;
        response.accessToken  = accessToken;
        return response;
    }

    static success(listaResultado, objetoResultado, pagination) {
        const response = new ResponseVO();
        response.listaResultado = listaResultado;
        response.objetoResultado = objetoResultado;
        response.contador = listaResultado ? listaResultado.length : 0;
        response.pagination = pagination;
        return response;
    }

    static error(codigoError, mensajeError) {
        const response = new ResponseVO();
        response.codigoError = codigoError;
        response.mensajeError = mensajeError;
        response.isError = true;
        return response;
    }
}

module.exports = ResponseVO;