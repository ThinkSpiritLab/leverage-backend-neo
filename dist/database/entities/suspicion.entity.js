"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Suspicion = void 0;
const typeorm_1 = require("typeorm");
let Suspicion = class Suspicion {
    submissionId;
    submission;
    mas0;
    md1;
    def;
    con;
    cpp;
    oo;
    cr;
    html;
    chn;
    qq;
    checked;
    hashsum;
};
exports.Suspicion = Suspicion;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], Suspicion.prototype, "submissionId", void 0);
__decorate([
    (0, typeorm_1.OneToOne)('Submission', (s) => s.sus, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'submissionId' }),
    __metadata("design:type", Object)
], Suspicion.prototype, "submission", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "mas0", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "md1", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "def", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "con", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "cpp", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "oo", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "cr", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "html", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "chn", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Suspicion.prototype, "qq", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Suspicion.prototype, "checked", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 100, nullable: true }),
    __metadata("design:type", String)
], Suspicion.prototype, "hashsum", void 0);
exports.Suspicion = Suspicion = __decorate([
    (0, typeorm_1.Entity)()
], Suspicion);
//# sourceMappingURL=suspicion.entity.js.map