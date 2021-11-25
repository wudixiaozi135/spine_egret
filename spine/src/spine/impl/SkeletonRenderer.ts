namespace spine {
    class AdapterTexture extends Texture {
        public readonly spriteSheet: egret.SpriteSheet;

        public constructor(bitmapData: egret.BitmapData) {
            super(bitmapData.source,bitmapData.width,bitmapData.height);
            let texture = new egret.Texture();
            texture.bitmapData = bitmapData;
            this.spriteSheet = new egret.SpriteSheet(texture);
        }

        /** NIY */
        setFilters(minFilter: TextureFilter, magFilter: TextureFilter): void { }
        setWraps(uWrap: TextureWrap, vWrap: TextureWrap): void { }
        dispose(): void { }
    }

    export function createSkeletonData(jsonData: string | {}, atlas: TextureAtlas) {
        let json = new SkeletonJson(new AtlasAttachmentLoader(atlas));
        return json.readSkeletonData(jsonData);
    }

    //二进制创建
    export function createSkeletonBinaryData(binData: any, atlas: TextureAtlas) {
        let binaryData = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
        return binaryData.readSkeletonData(new Uint8Array(binData));
    }

    export function createTextureAtlas(atlasData: string, textures: Record<string, egret.Texture>) {
        return new TextureAtlas(atlasData, (file: string) => {
            return new AdapterTexture(textures[file].bitmapData);
        });
    }

    export class SkeletonRenderer extends egret.DisplayObjectContainer {
        public readonly skeleton: Skeleton;
        public readonly skeletonData: SkeletonData;
        public readonly state: AnimationState;
        public readonly stateData: AnimationStateData;
        public readonly slotRenderers: SlotRenderer[] = [];
        private colored: boolean = false;

        static vertices = Utils.newFloatArray(8 * 1024);
        static QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];
        static VERTEX_SIZE = 2 + 2 + 4;
        static clipper: SkeletonClipping = new SkeletonClipping();

        public constructor(skeletonData: SkeletonData) {
            super();
            this.skeletonData = skeletonData;
            this.stateData = new AnimationStateData(skeletonData);
            this.state = new AnimationState(this.stateData);
            this.skeleton = new Skeleton(skeletonData);
            this.skeleton.updateWorldTransform();
            this.touchEnabled = true;
            this.scaleY = -1;

            for (let slot of this.skeleton.slots) {
                let renderer = new SlotRenderer();

                renderer.name = slot.data.name;
                this.slotRenderers.push(renderer);
                this.addChild(renderer);
                renderer.renderSlot(slot, this.skeleton, this.colored);
                this.colored = renderer.colored;

            }
            SkeletonRenderer.clipper.clipEnd();
        }

        //设置资源类型标识
        setResTypeBySlotName(slotName: string, resType: number)
        {
            if (!this.skeleton) return;
            let slot = this.skeleton.findSlot(slotName);
            if (!slot) return;
            slot.textureResType = resType;
        }

        setImageBySlotName(slotName: string, imgName: string)
        {
            if (!this.skeleton) return;
            let slot = this.skeleton.findSlot(slotName);
            if (!slot) return;
            let attachment = slot.getAttachment();
            if (!attachment) return;
            if (attachment instanceof RegionAttachment)
            {
                attachment.path = imgName;
                attachment.dirty = 1;
            }
            if (attachment instanceof MeshAttachment)
            {
                attachment.path = imgName;
                attachment.dirty = 1;
            }
        }

        public findSlotRenderer(name: string): SlotRenderer {
            return this.getChildByName(name) as SlotRenderer;
        }

        public update(dt: number) {
            this.state.update(dt);
            this.state.apply(this.skeleton);
            this.skeleton.updateWorldTransform();

            let drawOrder = this.skeleton.drawOrder;
            let slots = this.skeleton.slots;

            for (let i = 0; i < drawOrder.length; i++) {
                let slot = drawOrder[i].data.index;
                this.setChildIndex(this.slotRenderers[slot], i);
            }
            for (let i = 0; i < slots.length; i++) {
                let renderer = this.slotRenderers[i];
                renderer.renderSlot(slots[i], this.skeleton, this.colored);
                this.colored = renderer.colored;
            }
            SkeletonRenderer.clipper.clipEnd();
        }
    }

    export class SlotRenderer extends egret.DisplayObjectContainer {
        public colored: boolean = false;
        private currentMesh: egret.DisplayObject;
        private colorFilter: egret.ColorMatrixFilter;
        private tempColor = new Color();

        //颜色滤镜池
        static colorMatrixPool:egret.ColorMatrixFilter[];
        //数组滤镜池
        static arrayPool:any[][];

        static meshMap:any = {};

        public constructor() {
            super();
            this.currentMesh = new egret.Mesh()
            this.addChild(this.currentMesh)
        }

        public getRegionTexture(region: TextureAtlasRegion) {
            let sheet = (region.texture as AdapterTexture).spriteSheet;
            return sheet.$texture
        }

        public renderSlot(slot: Slot, skeleton: Skeleton, colored: boolean) {
            let bone = slot.bone;
            let attachment = slot.getAttachment();
            let texture: egret.Texture = null;
            let region: TextureAtlasRegion = null;
            let clipper = SkeletonRenderer.clipper;
            let numFloats = 0;
            if (slot.data.blendMode == BlendMode.Additive) {
                this.currentMesh.blendMode = egret.BlendMode.ADD;
            }
            else
            {
                this.currentMesh.blendMode = egret.BlendMode.NORMAL;
            }

            let vertices: ArrayLike<number> = SkeletonRenderer.vertices;
            let triangles: Array<number> = null;

            let currentName = this.currentMesh ? this.currentMesh.name : '';
            let attachmentColor = new Color()
            let vertexSize = clipper.isClipping() ? 2 : SkeletonRenderer.VERTEX_SIZE;
            let regionName = attachment ? attachment.name : '';
            if (attachment instanceof RegionAttachment) {
                this.visible = true;
                let regionAttachment = <RegionAttachment>attachment;
                if(!regionAttachment.rendererObject || attachment.dirty == 1)
                {
                    attachment.dirty = 0;
                }
                vertices = this.computeRegionVertices(slot, regionAttachment, false);
                triangles = SkeletonRenderer.QUAD_TRIANGLES;
                region = <TextureAtlasRegion>regionAttachment.region;
                attachmentColor = attachment.color
                numFloats = vertexSize * 4;
                texture = this.getRegionTexture(attachment.region as TextureAtlasRegion)

            } else if (attachment instanceof MeshAttachment) {
                this.visible = true;
                let mesh = <MeshAttachment>attachment;
                if(attachment.dirty == 1)
                {
                    mesh.updateUVs(slot.textureResType);
                    attachment.dirty = 0;
                }
                vertices = this.computeMeshVertices(slot, mesh, false);
                triangles = mesh.triangles;
                region = <TextureAtlasRegion>mesh.region;
                attachmentColor = attachment.color
                numFloats = (mesh.worldVerticesLength >> 1) * vertexSize;
                if (slot.textureResType == 1)
                {
                    texture = this.getRegionTexture(attachment.region as TextureAtlasRegion)
                } else
                {
                    texture = attachment.tmpTexture;
                }
            } else {
                this.visible = false;
            }

            if (texture != null) {
                //准备开始渲染
                let skeleton = slot.bone.skeleton;
                let skeletonColor = skeleton.color;
                let slotColor = slot.color;

                let alpha = skeletonColor.a * slotColor.a * attachmentColor.a;
                let color = this.tempColor;
                color.set(skeletonColor.r * slotColor.r * attachmentColor.r,
                    skeletonColor.g * slotColor.g * attachmentColor.g,
                    skeletonColor.b * slotColor.b * attachmentColor.b,
                    alpha);

                // 与后面 drawMesh 冲突
                // if (color.r != 1 || color.g != 1 || color.b != 1 || color.a != 1) {
                //     this.alpha = color.a
                // }

                let npos = SlotRenderer.createArr();
                let nuvs = SlotRenderer.createArr();
                let ncolors = SlotRenderer.createArr();
                let nindices = SlotRenderer.createArr();
                let j = 0;

                let finalVerticesLength = numFloats
                let finalIndicesLength = triangles.length
                let finalIndices = triangles
                let finalVertices = vertices
                if (clipper.isClipping()) {
                    console.log("isClipping == ",attachment.name)
                    finalVerticesLength = clipper.clippedVertices.length
                    finalIndicesLength = clipper.clippedTriangles.length
                    finalIndices = clipper.clippedTriangles
                    finalVertices = clipper.clippedVertices
                }

                for (; j < finalVerticesLength;) {
                    npos.push(finalVertices[j++]);
                    npos.push(finalVertices[j++]);


                    ncolors.push(vertices[j++]);
                    ncolors.push(vertices[j++]);
                    ncolors.push(vertices[j++]);
                    ncolors.push(vertices[j++]);

                    nuvs.push(vertices[j++]);
                    nuvs.push(vertices[j++]);
                }
                for (j = 0; j < finalIndicesLength; j++) {
                    nindices.push(finalIndices[j])
                }

                if (region) {
                    //console.log("renderer.name=", attachment.name, color)
                    this.visible = true
                    this.drawMesh(texture, nuvs, npos, nindices, color)
                    this.currentMesh.visible = true
                }
                else {
                    this.visible = false
                }
                var render = SlotRenderer;
                render.releaseArr(nuvs);
                render.releaseArr(npos);
                render.releaseArr(nindices);
            }
            clipper.clipEndWithSlot(slot);
        }

        private drawMesh(texture: egret.Texture, uvs, vertices, indices, color: Color) {
            let meshObj = this.currentMesh as egret.Mesh
            const meshNode = meshObj.$renderNode as egret.sys.MeshNode;
            meshNode.uvs.length = uvs.length
            meshNode.vertices.length = vertices.length
            meshNode.indices.length = indices.length

            for(let i=0;i<uvs.length;++i)
            {
                meshNode.uvs[i] = uvs[i]
            }
            for (let i = 0; i < vertices.length; ++i) {
                meshNode.vertices[i] = vertices[i]
            }

            for(let i=0;i<indices.length;++i)
            {
                meshNode.indices[i] = indices[i];
            }

            meshNode.image = texture.bitmapData;

            meshNode.drawMesh(
                texture.$bitmapX, texture.$bitmapY,
                texture.$bitmapWidth, texture.$bitmapHeight,
                texture.$offsetX, texture.$offsetY,
                texture.textureWidth, texture.textureHeight
            );
            meshNode.imageWidth = texture.$sourceWidth;
            meshNode.imageHeight = texture.$sourceHeight;

            //color.setFromString()
            //color.clamp()
            meshObj.texture = texture

            //使用 filters drawcall 很高
            let tmpColor = SlotRenderer.meshMap[meshObj.hashCode];
            if (!tmpColor || color.r != tmpColor.r || color.g != tmpColor.g || color.b != tmpColor.b || color.a != tmpColor.a)
            {
                var colorMatrix = SlotRenderer.createArr();
                for (var i = 0; i < 20; i++)
                {
                    colorMatrix[i] = 0;
                }
                colorMatrix[0] = color.r;
                colorMatrix[6] = color.g;
                colorMatrix[12] = color.b;
                colorMatrix[18] = color.a;

                var colorFilter = SlotRenderer.createColorFilter();
                colorFilter.matrix = colorMatrix;

                var colorArr = SlotRenderer.createArr();
                colorArr.push(colorFilter);

                if (meshObj.filters && meshObj.filters[0] instanceof egret.ColorMatrixFilter)
                {
                    SlotRenderer.releaseColorFilter(meshObj.filters[0]);
                }
                meshObj.filters = colorArr;
                if (!tmpColor)
                {
                    SlotRenderer.meshMap[meshObj.hashCode] = {r: color.r, g: color.g, b: color.b, a: color.a};
                } else
                {
                    tmpColor.r = color.r;
                    tmpColor.g = color.g;
                    tmpColor.b = color.b;
                    tmpColor.a = color.a;
                }
            }
            meshObj.$updateVertices();
        }

        static createArr():any[]
        {
            var pool = SlotRenderer.arrayPool;
            if (!pool || pool.length <= 0)
            {
                pool = SlotRenderer.arrayPool =  [];
                for (let i = 0; i < 500; i++)
                {
                    pool[i] = [];
                }
            }
            return pool.pop();
        }

        static releaseArr(arr: number[])
        {
            if (!arr) return;
            arr.length = 0;
            var pool = SlotRenderer.arrayPool;
            pool && pool.push(arr);
        }

        //获得颜色滤镜
        static createColorFilter():egret.ColorMatrixFilter
        {
            var pool = SlotRenderer.colorMatrixPool;
            if (!pool || pool.length <= 0)
            {
                pool = SlotRenderer.colorMatrixPool =  [];
                for (let i = 0; i < 300; i++)
                {
                    var filter = new egret.ColorMatrixFilter();
                    pool[i] = filter;
                }
            }
            return pool.pop();
        }

        //回收颜色滤镜
        static releaseColorFilter(filter: any)
        {
            if (!filter) return;
            var pool = SlotRenderer.colorMatrixPool;
            if (pool)
            {
                pool.push(filter);
                //重置数据
                filter.$uniforms = filter.$uniforms || {};
                let matrix = filter.$uniforms.matrix;
                if (matrix)
                {
                    for (let i = 0; i < matrix.length; i++)
                    {
                        matrix[i] = 0;
                    }
                    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
                }
                let color = filter.$uniforms.colorAdd;
                if (color)
                {
                    color.x = color.y = color.z = color.w = 0;
                }
            }
        }

        private colorHex(color: Color) {
            var strHex = "0x";
            let rgb = [color.r, color.g, color.b]

            for (var i = 0; i < rgb.length; i++) {
                var hex = Number(Math.floor(rgb[i] * 255)).toString(16);
                if (hex.length < 2) {
                    hex = '0' + hex;
                }
                strHex += hex;
            }
            if (strHex.length !== 8) {
                strHex = "0xFFFFFF";
            }
            //console.log("Number(strHex)",Number(strHex),strHex)
            return Number(strHex);
        }
        private createMesh(region: TextureAtlasRegion) {
            let mesh = new egret.Mesh()
            mesh.name = region.name
            this.addChild(mesh)
            return mesh
        }

        private computeRegionVertices(slot: Slot, region: RegionAttachment, pma: boolean) {
            let skeleton = slot.bone.skeleton;
            let skeletonColor = skeleton.color;
            let slotColor = slot.color;
            let regionColor = region.color;
            let alpha = skeletonColor.a * slotColor.a * regionColor.a;
            let multiplier = pma ? alpha : 1;
            let color = this.tempColor;
            color.set(skeletonColor.r * slotColor.r * regionColor.r * multiplier,
                skeletonColor.g * slotColor.g * regionColor.g * multiplier,
                skeletonColor.b * slotColor.b * regionColor.b * multiplier,
                alpha);

            region.computeWorldVertices(slot.bone, SkeletonRenderer.vertices, 0, SkeletonRenderer.VERTEX_SIZE);

            let vertices = SkeletonRenderer.vertices;
            let uvs = region.uvs;

            vertices[RegionAttachment.C1R] = color.r;
            vertices[RegionAttachment.C1G] = color.g;
            vertices[RegionAttachment.C1B] = color.b;
            vertices[RegionAttachment.C1A] = color.a;
            vertices[RegionAttachment.U1] = uvs[0];
            vertices[RegionAttachment.V1] = uvs[1];

            vertices[RegionAttachment.C2R] = color.r;
            vertices[RegionAttachment.C2G] = color.g;
            vertices[RegionAttachment.C2B] = color.b;
            vertices[RegionAttachment.C2A] = color.a;
            vertices[RegionAttachment.U2] = uvs[2];
            vertices[RegionAttachment.V2] = uvs[3];

            vertices[RegionAttachment.C3R] = color.r;
            vertices[RegionAttachment.C3G] = color.g;
            vertices[RegionAttachment.C3B] = color.b;
            vertices[RegionAttachment.C3A] = color.a;
            vertices[RegionAttachment.U3] = uvs[4];
            vertices[RegionAttachment.V3] = uvs[5];

            vertices[RegionAttachment.C4R] = color.r;
            vertices[RegionAttachment.C4G] = color.g;
            vertices[RegionAttachment.C4B] = color.b;
            vertices[RegionAttachment.C4A] = color.a;
            vertices[RegionAttachment.U4] = uvs[6];
            vertices[RegionAttachment.V4] = uvs[7];

            return vertices;
        }

        private computeMeshVertices(slot: Slot, mesh: MeshAttachment, pma: boolean) {
            let skeleton = slot.bone.skeleton;
            let skeletonColor = skeleton.color;
            let slotColor = slot.color;
            let regionColor = mesh.color;
            let alpha = skeletonColor.a * slotColor.a * regionColor.a;
            let multiplier = pma ? alpha : 1;
            let color = this.tempColor;
            color.set(skeletonColor.r * slotColor.r * regionColor.r * multiplier,
                skeletonColor.g * slotColor.g * regionColor.g * multiplier,
                skeletonColor.b * slotColor.b * regionColor.b * multiplier,
                alpha);

            let numVertices = mesh.worldVerticesLength / 2;
            if (SkeletonRenderer.vertices.length < mesh.worldVerticesLength) {
                SkeletonRenderer.vertices = Utils.newFloatArray(mesh.worldVerticesLength);
            }
            let vertices = SkeletonRenderer.vertices;
            mesh.computeWorldVertices(slot, 0, mesh.worldVerticesLength, vertices, 0, SkeletonRenderer.VERTEX_SIZE);

            let uvs = mesh.uvs;
            for (let i = 0, n = numVertices, u = 0, v = 2; i < n; i++) {
                vertices[v++] = color.r;
                vertices[v++] = color.g;
                vertices[v++] = color.b;
                vertices[v++] = color.a;
                vertices[v++] = uvs[u++];
                vertices[v++] = uvs[u++];
                v += 2;
            }

            return vertices;
        }

        private createSprite(attachment: RegionAttachment, region: TextureAtlasRegion) {
            let sheet = (region.texture as AdapterTexture).spriteSheet;
            let texture = sheet.getTexture(region.name) || region.rotate
                ? sheet.createTexture(
                    region.name,
                    region.x, region.y,
                    region.height, region.width,
                    region.offsetX, region.offsetY,
                    region.originalHeight, region.originalWidth
                )
                : sheet.createTexture(
                    region.name,
                    region.x, region.y,
                    region.width, region.height,
                    region.offsetX, region.offsetY,
                    region.originalWidth, region.originalHeight
                );
            let sprite = new egret.Bitmap(texture);

            sprite.name = region.name;
            sprite.x = attachment.x;
            sprite.y = attachment.y;
            sprite.anchorOffsetX = 0.5 * sprite.width;
            sprite.anchorOffsetY = 0.5 * sprite.height;
            sprite.scaleX = attachment.scaleX * (attachment.width / region.width);
            sprite.scaleY = -attachment.scaleY * (attachment.height / region.height);
            sprite.rotation = attachment.rotation;
            if (region.rotate) {
                sprite.rotation -= 90;
            }
            this.addChild(sprite);

            return sprite;
        }
    }
}
