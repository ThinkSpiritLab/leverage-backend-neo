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
exports.User = void 0;
const typeorm_1 = require("typeorm");
let User = class User {
    id;
    username;
    passwordHash;
    nickname;
    sex;
    authority;
    submits;
    rank;
    status;
    statusEndsAt;
    remarks;
    accepts;
    certifiedName;
    certifyType;
    grade;
    college;
    profession;
    class;
    shadowed;
    createdAt;
    updatedAt;
    metas;
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { length: 20 }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { name: 'password', length: 128, select: false }),
    __metadata("design:type", String)
], User.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true, length: 32 }),
    __metadata("design:type", Object)
], User.prototype, "nickname", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { default: null }),
    __metadata("design:type", String)
], User.prototype, "sex", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { comment: '用户权限', default: 'user' }),
    __metadata("design:type", String)
], User.prototype, "authority", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "submits", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: null }),
    __metadata("design:type", Number)
], User.prototype, "rank", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)('datetime', { nullable: true }),
    __metadata("design:type", Date)
], User.prototype, "statusEndsAt", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { default: null }),
    __metadata("design:type", String)
], User.prototype, "remarks", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "accepts", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)('varchar', { comment: '真实姓名', length: 32, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "certifiedName", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { comment: '认证类别', length: 32, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "certifyType", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true, length: 16 }),
    __metadata("design:type", Object)
], User.prototype, "grade", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true, length: 32 }),
    __metadata("design:type", Object)
], User.prototype, "college", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true, length: 32 }),
    __metadata("design:type", Object)
], User.prototype, "profession", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar', { nullable: true, length: 32 }),
    __metadata("design:type", Object)
], User.prototype, "class", void 0);
__decorate([
    (0, typeorm_1.Column)('int', { default: 0, select: false }),
    __metadata("design:type", Number)
], User.prototype, "shadowed", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('UserMeta', (meta) => meta.user, { cascade: true }),
    __metadata("design:type", Array)
], User.prototype, "metas", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)(),
    (0, typeorm_1.Unique)(['username'])
], User);
//# sourceMappingURL=user.entity.js.map